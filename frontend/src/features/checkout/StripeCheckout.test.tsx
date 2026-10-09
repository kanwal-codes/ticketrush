import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setToken } from '../../auth/session'
import { resetServerTime } from '../../lib/time'
import { eventDetail, holdView } from '../../test/fixtures'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { setActiveHold } from '../seats/activeHold'
import { checkoutTimings } from './timings'

const paidOrder = {
  id: 9, reference: 'TR-ABC123', eventId: 7, status: 'PAID', subtotalCents: 19200, feeCents: 1440, totalCents: 20640, currency: 'CAD',
  failureReason: null, createdAt: '2026-10-09T14:05:00Z', paidAt: '2026-10-09T14:05:01Z', seats: [], tickets: [],
}
const base = {
  'GET /api/events/7': () => json(eventDetail()),
  'GET /api/events/7/holds/me': () => json(holdView()),
  'GET /api/me': () => json({ id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST', emailVerified: true }),
}

/** A stand-in for Stripe.js: the test decides what the card form holds and what Stripe says about it. */
function fakeStripe(result: { paymentMethod?: { id: string }; error?: { message: string } } = { paymentMethod: { id: 'pm_123' } }) {
  const state: { change?: (c: { complete: boolean; error?: { message: string } }) => void } = {}
  const element = {
    mount: vi.fn((el: HTMLElement) => el.setAttribute('data-mounted', 'true')),
    on: vi.fn((_event: string, handler: typeof state.change) => (state.change = handler)),
    destroy: vi.fn(),
  }
  const stripe = {
    elements: vi.fn(() => ({ create: vi.fn(() => element) })),
    createPaymentMethod: vi.fn(async () => result),
  }
  const factory = vi.fn(() => stripe)
  window.Stripe = factory as unknown as typeof window.Stripe
  return { stripe, element, factory, state }
}

const original = checkoutTimings.poll
beforeEach(() => {
  sessionStorage.clear()
  setToken('abc')
  resetServerTime()
  setActiveHold({ holdId: 55, eventId: 7, expiresAt: '2026-10-09T14:15:00Z' })
  checkoutTimings.poll = 10
})
afterEach(() => {
  checkoutTimings.poll = original
  vi.unstubAllEnvs()
  delete window.Stripe
})

describe('checkout with Stripe', () => {
  it('uses the built-in test cards and loads nothing from Stripe without a key', async () => {
    mockApi(base)
    renderRoute('/events/7/checkout')
    expect(await screen.findByLabelText('Card number')).toBeInTheDocument()
    expect(document.querySelector('script[src*="stripe.com"]')).toBeNull()
  })

  it('shows Stripe\'s card form instead of our own fields, and pays with the PaymentMethod it makes', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { stripe, factory } = fakeStripe()
    const { calls } = mockApi({ ...base, 'POST /api/orders': () => json(paidOrder, 201), 'GET /api/tickets': () => json([]) })
    renderRoute('/events/7/checkout')

    await waitFor(() => expect(document.querySelector('.stripe-card')?.getAttribute('data-mounted')).toBe('true'))
    expect(factory).toHaveBeenCalledWith('pk_test_123')
    expect(screen.queryByLabelText('Card number')).not.toBeInTheDocument()
    expect(screen.getByText(/Use card 4242 4242 4242 4242/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /\$206\.40$/ }))
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/orders'))).toBe(true))
    const order = calls.find((c) => c.url.endsWith('/api/orders'))!
    expect(await order.json()).toEqual({ holdId: 55, paymentToken: 'pm_123' })
    expect(stripe.createPaymentMethod).toHaveBeenCalledTimes(1)
  })

  it('says what Stripe says is wrong with the card and does not ask the server to charge it', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    fakeStripe({ error: { message: 'Your card number is incomplete.' } })
    const { calls } = mockApi(base)
    renderRoute('/events/7/checkout')
    await waitFor(() => expect(document.querySelector('.stripe-card')?.getAttribute('data-mounted')).toBe('true'))

    await userEvent.click(screen.getByRole('button', { name: /\$206\.40$/ }))
    expect(await screen.findByText('Your card number is incomplete.')).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/api/orders'))).toBe(false)
  })

  it('shows the card form\'s own messages as the guest types', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { state } = fakeStripe()
    mockApi(base)
    renderRoute('/events/7/checkout')
    await waitFor(() => expect(state.change).toBeDefined())
    state.change!({ complete: false, error: { message: 'Your card number is invalid.' } })
    expect(await screen.findByText('Your card number is invalid.')).toBeInTheDocument()
    state.change!({ complete: true })
    await waitFor(() => expect(screen.queryByText('Your card number is invalid.')).not.toBeInTheDocument())
  })

  it('retries an unconfirmed payment with the very same PaymentMethod, so it cannot become a second payment', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    const { stripe } = fakeStripe()
    let attempts = 0
    const { calls } = mockApi({
      ...base,
      'POST /api/orders': () => (++attempts === 1 ? json({ title: 'Server error' }, 503) : json(paidOrder, 201)),
      'GET /api/tickets': () => json([]),
    })
    renderRoute('/events/7/checkout')
    await waitFor(() => expect(document.querySelector('.stripe-card')?.getAttribute('data-mounted')).toBe('true'))

    await userEvent.click(screen.getByRole('button', { name: /\$206\.40$/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Check and try again/ }))
    await waitFor(() => expect(attempts).toBe(2))

    const orders = calls.filter((c) => c.url.endsWith('/api/orders'))
    expect(orders[0]!.headers.get('Idempotency-Key')).toBe(orders[1]!.headers.get('Idempotency-Key'))
    expect(await orders[1]!.json()).toEqual({ holdId: 55, paymentToken: 'pm_123' })
    expect(stripe.createPaymentMethod).toHaveBeenCalledTimes(1)
  })

  it('says so when Stripe\'s script cannot load, instead of waiting forever', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    mockApi(base)
    renderRoute('/events/7/checkout')
    const script = await waitFor(() => {
      const found = document.querySelector<HTMLScriptElement>('script[src*="js.stripe.com"]')
      expect(found).not.toBeNull()
      return found!
    })
    script.onerror?.(new Event('error'))
    await userEvent.click(await screen.findByRole('button', { name: /\$206\.40$/ }))
    expect(await screen.findByText(/The card form could not load/)).toBeInTheDocument()
    script.remove()
  })

  it('says the form is still loading when paid too early', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123')
    mockApi(base)
    renderRoute('/events/7/checkout')
    await userEvent.click(await screen.findByRole('button', { name: /\$206\.40$/ }))
    expect(await screen.findByText(/still loading/)).toBeInTheDocument()
    document.querySelector('script[src*="js.stripe.com"]')?.remove()
  })
})
