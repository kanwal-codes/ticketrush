import { afterEach, describe, expect, it, vi } from 'vitest'

// The loader remembers its script between calls, so each test gets a fresh copy of it.
const fresh = async () => {
  vi.resetModules()
  return import('./stripe')
}

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.Stripe
  document.querySelectorAll('script[src*="js.stripe.com"]').forEach((s) => s.remove())
})

describe('stripe', () => {
  it('has no key unless the build was given one', async () => {
    const { stripePublishableKey } = await fresh()
    expect(stripePublishableKey()).toBe('')
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', '  pk_test_1  ')
    expect(stripePublishableKey()).toBe('pk_test_1')
  })

  it('loads the script once, starts it with the key, and tries again after a failure', async () => {
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_1')
    const { loadStripe } = await fresh()
    const first = loadStripe()
    const script = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')!
    script.onerror?.(new Event('error'))
    await expect(first).rejects.toThrow('could not be loaded')
    script.remove()

    const started = { elements: vi.fn() }
    const second = loadStripe()
    const retry = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')!
    window.Stripe = vi.fn(() => started) as unknown as typeof window.Stripe
    retry.onload?.(new Event('load'))
    await expect(second).resolves.toBe(started)
    expect(window.Stripe).toHaveBeenCalledWith('pk_test_1')
    // Already there: no second script.
    await expect(loadStripe()).resolves.toBe(started)
    expect(document.querySelectorAll('script[src*="js.stripe.com"]')).toHaveLength(1)
  })

  it('rejects when the script loads but Stripe does not start', async () => {
    const { loadStripe } = await fresh()
    const pending = loadStripe()
    document.querySelector<HTMLScriptElement>('script[src*="js.stripe.com"]')!.onload?.(new Event('load'))
    await expect(pending).rejects.toThrow('did not start')
  })
})
