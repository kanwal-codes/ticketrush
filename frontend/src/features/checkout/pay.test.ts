import { describe, expect, it } from 'vitest'
import type { OrderView } from '../../api/types'
import { json, mockApi } from '../../test/mockApi'
import { checkOrder, declineMessage, submitPayment } from './pay'

const order = (overrides: Partial<OrderView> = {}): OrderView => ({
  id: 9,
  reference: 'TR-ABC123',
  eventId: 7,
  status: 'PAID',
  subtotalCents: 19200,
  feeCents: 1440,
  totalCents: 20640,
  currency: 'CAD',
  failureReason: null,
  createdAt: '2026-10-09T14:05:00Z',
  paidAt: '2026-10-09T14:05:01Z',
  seats: [],
  tickets: [],
  ...overrides,
})

const VISA = '4242 4242 4242 4242'
const keyOf = (request: Request) => request.headers.get('Idempotency-Key')

describe('submitPayment', () => {
  it('pays, sends a token and never the card number, and ends the attempt', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json(order(), 201) })
    const outcome = await submitPayment(55, VISA)

    expect(outcome).toMatchObject({ kind: 'paid' })
    const sent = await calls[0]!.json()
    expect(sent).toEqual({ holdId: 55, paymentToken: 'tok_visa' })
    expect(JSON.stringify(sent)).not.toContain('4242')
    expect(sessionStorage.getItem('tr.idem.55')).toBeNull()
  })

  it('retries with the same key after the connection drops, so it cannot charge twice', async () => {
    let attempt = 0
    const { calls } = mockApi({
      'POST /api/orders': () => (++attempt === 1 ? Promise.reject(new TypeError('Failed to fetch')) : json(order(), 200, { 'Idempotent-Replay': 'true' })),
    })

    const first = await submitPayment(55, VISA)
    expect(first.kind).toBe('unknown')
    const second = await submitPayment(55, VISA)

    expect(second.kind).toBe('paid')
    expect(keyOf(calls[0]!)).toBe(keyOf(calls[1]!))
  })

  it('treats a server error as unknown, not as a failure, and keeps the key', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json({ title: 'Server error' }, 503) })
    expect((await submitPayment(55, VISA)).kind).toBe('unknown')
    await submitPayment(55, VISA)
    expect(keyOf(calls[0]!)).toBe(keyOf(calls[1]!))
  })

  it('keeps the key while the payment is pending, because it may have been charged', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json(order({ status: 'PENDING_PAYMENT', paidAt: null }), 202) })
    const outcome = await submitPayment(55, '4000 0000 0000 0119')
    expect(outcome).toMatchObject({ kind: 'pending' })
    await submitPayment(55, '4000 0000 0000 0119')
    expect(keyOf(calls[0]!)).toBe(keyOf(calls[1]!))
  })

  it('reports a decline with its reason, and the next card gets a new key', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json(order({ status: 'FAILED', failureReason: 'card_declined', paidAt: null }), 402) })
    const outcome = await submitPayment(55, '4000 0000 0000 0002')
    expect(outcome).toMatchObject({ kind: 'declined', message: 'Your card was declined. Try another card.' })

    await submitPayment(55, VISA)
    expect(keyOf(calls[0]!)).not.toBe(keyOf(calls[1]!))
  })

  it('a changed card is a new attempt with a new key', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json({ title: 'Server error' }, 502) })
    await submitPayment(55, VISA)
    await submitPayment(55, '4000 0000 0000 0002')
    expect(keyOf(calls[0]!)).not.toBe(keyOf(calls[1]!))
  })

  it('says the seats were lost and the money is coming back', async () => {
    mockApi({ 'POST /api/orders': () => json(order({ status: 'REFUNDED', paidAt: null }), 409) })
    expect(await submitPayment(55, VISA)).toMatchObject({ kind: 'refunded', refunding: false })
    mockApi({ 'POST /api/orders': () => json(order({ status: 'REFUNDING', paidAt: null }), 409) })
    expect(await submitPayment(55, VISA)).toMatchObject({ kind: 'refunded', refunding: true })
  })

  it('tells an expired hold apart from a payment that is already in progress', async () => {
    mockApi({ 'POST /api/orders': () => json({ title: 'Hold unavailable', detail: 'Your hold has expired. Pick your seats again.' }, 409) })
    expect(await submitPayment(55, VISA)).toMatchObject({ kind: 'holdGone', message: 'Your hold has expired. Pick your seats again.' })

    mockApi({ 'POST /api/orders': () => json({ title: 'Payment in progress', detail: 'A payment is already in progress' }, 409) })
    expect(await submitPayment(55, VISA)).toMatchObject({ kind: 'inProgress' })
  })

  it('starts over with a new key if the server says the key was used for something else', async () => {
    const { calls } = mockApi({ 'POST /api/orders': () => json({ title: 'Idempotency key reused', detail: 'That key was used for a different request' }, 422) })
    expect((await submitPayment(55, VISA)).kind).toBe('rejected')
    await submitPayment(55, VISA)
    expect(keyOf(calls[0]!)).not.toBe(keyOf(calls[1]!))
  })

  it('does not mistake a problem response for an order', async () => {
    // Problem responses also have a numeric "status"; an order's status is a word.
    mockApi({ 'POST /api/orders': () => json({ title: 'Not found', status: 404, detail: 'Hold 9 not found' }, 404) })
    expect(await submitPayment(55, VISA)).toMatchObject({ kind: 'holdGone' })
  })
})

describe('checkOrder', () => {
  it('moves a pending order to paid when the provider has answered', async () => {
    mockApi({ 'GET /api/orders/9': () => json(order()) })
    expect(await checkOrder(9, 55)).toMatchObject({ kind: 'paid' })
  })

  it('stays pending while the provider has not answered', async () => {
    mockApi({ 'GET /api/orders/9': () => json(order({ status: 'PENDING_PAYMENT', paidAt: null })) })
    expect(await checkOrder(9, 55)).toMatchObject({ kind: 'pending' })
  })

  it('is unknown, not failed, when it cannot reach the server', async () => {
    mockApi({ 'GET /api/orders/9': () => Promise.reject(new TypeError('Failed to fetch')) })
    expect((await checkOrder(9, 55)).kind).toBe('unknown')
  })
})

describe('declineMessage', () => {
  it('speaks plainly for each reason the provider gives', () => {
    expect(declineMessage('card_declined')).toMatch(/declined/)
    expect(declineMessage('insufficient_funds')).toMatch(/funds/)
    expect(declineMessage('invalid_payment_token')).toMatch(/could not read/)
    expect(declineMessage(null)).toMatch(/did not go through/)
  })
})
