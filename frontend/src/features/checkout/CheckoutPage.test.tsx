import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OrderView } from '../../api/types'
import { setToken } from '../../auth/session'
import { resetServerTime } from '../../lib/time'
import { eventDetail, holdView } from '../../test/fixtures'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { getActiveHold, setActiveHold } from '../seats/activeHold'
import { checkoutTimings } from './timings'

const me = { id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST' }
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

/** The hold exists until an order for it resolves; after that the server no longer returns it. */
const state = { holdGone: false }
const base = {
  'GET /api/events/7': () => json(eventDetail()),
  'GET /api/events/7/holds/me': () => (state.holdGone ? json({ title: 'Not found', detail: 'You have no active hold for this event' }, 404) : json(holdView())),
  'GET /api/me': () => json(me),
}
const settle = (response: Response) => {
  state.holdGone = true
  return response
}

async function fillCard(number = '4242424242424242') {
  await userEvent.type(screen.getByLabelText('Card number'), number)
  await userEvent.type(screen.getByLabelText('Expiry'), '1234')
  await userEvent.type(screen.getByLabelText('Security code'), '123')
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pay = (total = '$206.40') => userEvent.click(screen.getByRole('button', { name: new RegExp(`${escapeRegExp(total)}$`) }))

const original = checkoutTimings.poll
beforeEach(() => {
  setToken('abc')
  resetServerTime()
  setActiveHold({ holdId: 55, eventId: 7, expiresAt: '2026-10-09T14:15:00Z' })
  checkoutTimings.poll = 10
  state.holdGone = false
})
afterEach(() => {
  checkoutTimings.poll = original
})

describe('CheckoutPage', () => {
  it('shows what is being bought and the final price before asking for a card', async () => {
    mockApi(base)
    renderRoute('/events/7/checkout')

    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Afterlight Tour' })
    expect(within(summary).getByText('Floor, row A, seats 1 and 2')).toBeInTheDocument()
    expect(within(summary).getByText('2 tickets')).toBeInTheDocument()
    expect(within(summary).getByText('$192.00')).toBeInTheDocument()
    expect(within(summary).getByText('Service fee')).toBeInTheDocument()
    expect(within(summary).getByText('$14.40')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay $206.40' })).toBeInTheDocument()
    expect(screen.getByText('ana@example.org')).toBeInTheDocument()
    expect(screen.getByText(/final price\. Nothing is added after this step/)).toBeInTheDocument()
    expect(screen.getByText(/not be charged twice/)).toBeInTheDocument()
  })

  it('checks the card before sending anything', async () => {
    const { calls } = mockApi(base)
    renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await pay()

    expect(await screen.findByText('Enter the number on your card')).toBeInTheDocument()
    expect(screen.getByText('Enter the expiry as MM/YY')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('pays with a test card, sends a token, and takes the guest to their tickets', async () => {
    const { calls } = mockApi({ ...base, 'POST /api/orders': () => settle(json(order(), 201)), 'GET /api/tickets': () => json([]) })
    const { router } = renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard()
    await pay()

    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    expect(router.state.location.state).toEqual({ paid: { reference: 'TR-ABC123', totalCents: 20640 } })
    expect(getActiveHold()).toBeNull()
    const sent = await calls.find((c) => c.method === 'POST')!.json()
    expect(sent).toEqual({ holdId: 55, paymentToken: 'tok_visa' })
  })

  it('fills in a test card for the guest on request', async () => {
    mockApi(base)
    renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await userEvent.click(screen.getByText('Use a test card'))
    await userEvent.click(screen.getByRole('button', { name: '4000 0000 0000 0002' }))
    expect(screen.getByLabelText('Card number')).toHaveValue('4000 0000 0000 0002')
    expect(screen.getByLabelText('Expiry')).toHaveValue('12/34')
  })

  it('keeps the seats after a decline and lets the guest try another card with a new key', async () => {
    const results = [json(order({ status: 'FAILED', failureReason: 'card_declined', paidAt: null }), 402), json(order(), 201)]
    const { calls } = mockApi({ ...base, 'POST /api/orders': () => results.shift()!, 'GET /api/tickets': () => json([]) })
    const { router } = renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard('4000000000000002')
    await pay()

    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined. Try another card.')
    expect(getActiveHold()).not.toBeNull()
    expect(screen.getByLabelText('Card number')).toHaveValue('4000 0000 0000 0002')

    await userEvent.clear(screen.getByLabelText('Card number'))
    await userEvent.type(screen.getByLabelText('Card number'), '4242424242424242')
    await pay()

    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts[0]!.headers.get('Idempotency-Key')).not.toBe(posts[1]!.headers.get('Idempotency-Key'))
  })

  it('retries safely with the same key when the connection drops, and says so', async () => {
    let attempt = 0
    const { calls } = mockApi({
      ...base,
      'POST /api/orders': () => (++attempt === 1 ? Promise.reject(new TypeError('Failed to fetch')) : json(order(), 200, { 'Idempotent-Replay': 'true' })),
      'GET /api/tickets': () => json([]),
    })
    const { router } = renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard()
    await pay()

    expect(await screen.findByRole('alert')).toHaveTextContent(/will not be charged twice/)
    await userEvent.click(screen.getByRole('button', { name: /Check and try again/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts[0]!.headers.get('Idempotency-Key')).toBe(posts[1]!.headers.get('Idempotency-Key'))
  })

  it('tells the guest not to pay again while the outcome is unknown, then moves on when it is known', async () => {
    let polls = 0
    const { calls } = mockApi({
      ...base,
      'POST /api/orders': () => json(order({ status: 'PENDING_PAYMENT', paidAt: null }), 202),
      'GET /api/orders/9': () => json(++polls < 3 ? order({ status: 'PENDING_PAYMENT', paidAt: null }) : order()),
      'GET /api/tickets': () => json([]),
    })
    const { router } = renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard('4000000000000119')
    await pay()

    expect(await screen.findByRole('heading', { name: 'Confirming your payment' })).toBeInTheDocument()
    expect(screen.getByText('Please do not pay again.')).toBeInTheDocument()
    expect(screen.getByText('Order TR-ABC123')).toBeInTheDocument()

    await waitFor(() => expect(router.state.location.pathname).toBe('/tickets'))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1) // it only ever asked; it never paid again
  })

  it('says plainly when the seats were lost and the money has been returned', async () => {
    mockApi({ ...base, 'POST /api/orders': () => settle(json(order({ status: 'REFUNDED', paidAt: null }), 409)) })
    renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard()
    await pay()

    expect(await screen.findByRole('heading', { name: 'Sorry, those seats were taken' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your money has been returned to your card.')
    expect(screen.getByRole('link', { name: 'Choose other seats' })).toHaveAttribute('href', '/events/7/seats')
    expect(getActiveHold()).toBeNull()
  })

  it('says so when the hold ran out before the guest paid', async () => {
    mockApi({ ...base, 'POST /api/orders': () => json({ title: 'Hold unavailable', detail: 'Your hold has expired. Pick your seats again.' }, 409) })
    renderRoute('/events/7/checkout')
    await screen.findByRole('heading', { name: 'Checkout' })
    await fillCard()
    await pay()

    expect(await screen.findByRole('heading', { name: 'Your seats are no longer held' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your hold has expired')
    expect(screen.getByRole('link', { name: 'Choose seats again' })).toBeInTheDocument()
  })

  it('has nothing to pay for when the guest holds no seats', async () => {
    mockApi({ ...base, 'GET /api/events/7/holds/me': () => json({ title: 'Not found', detail: 'You have no active hold for this event' }, 404) })
    renderRoute('/events/7/checkout')
    expect(await screen.findByRole('heading', { name: 'You have no seats held' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose seats' })).toHaveAttribute('href', '/events/7/seats')
  })
})
