/** The public key the build was given. Without one the checkout uses the built-in test cards and loads nothing from Stripe. */
export const stripePublishableKey = (): string => (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? ''

/** The few parts of Stripe.js this app uses. Card numbers are typed into Stripe's own frame and never reach this page's code. */
export interface StripeCardElement {
  mount(element: HTMLElement): void
  on(event: 'change', handler: (change: { complete: boolean; error?: { message?: string } }) => void): void
  destroy(): void
}

export interface StripeApi {
  elements(): { create(type: 'card', options?: { hidePostalCode?: boolean; style?: unknown }): StripeCardElement }
  createPaymentMethod(input: { type: 'card'; card: StripeCardElement }): Promise<{ paymentMethod?: { id: string }; error?: { message?: string } }>
}

declare global {
  interface Window {
    Stripe?: (key: string) => StripeApi
  }
}

const SCRIPT = 'https://js.stripe.com/v3/'

let loading: Promise<StripeApi> | null = null

/** Loads Stripe.js (once, on the checkout page only) and starts it with the publishable key. */
export function loadStripe(): Promise<StripeApi> {
  const start = () => (window.Stripe ? window.Stripe(stripePublishableKey()) : null)
  const ready = start()
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<StripeApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      const api = start()
      if (api) resolve(api)
      else reject(new Error('Stripe did not start'))
    }
    script.onerror = () => {
      loading = null // so a later attempt can try again
      reject(new Error('Stripe could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return loading
}
