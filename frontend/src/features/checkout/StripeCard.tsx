import { useEffect, useRef, useState } from 'react'
import { loadStripe, type StripeApi, type StripeCardElement } from '../../lib/stripe'

/** What the checkout needs from the card form: turn what was typed into a PaymentMethod id, or say what is wrong with it. */
export interface CardForm {
  createPaymentMethod(): Promise<{ id: string } | { error: string }>
}

interface Props {
  /** Called with the form once it is ready to use, and with null if it goes away. */
  onForm: (form: CardForm | null) => void
  /** Stripe's script could not be loaded: an ad blocker, a strict network. */
  onUnavailable: () => void
}

/** Stripe's card form: one frame that holds the number, expiry and code, so none of them are ever in this page. */
export function StripeCard({ onForm, onUnavailable }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [problem, setProblem] = useState('')
  const forms = useRef({ onForm, onUnavailable })
  useEffect(() => {
    forms.current = { onForm, onUnavailable }
  })

  useEffect(() => {
    let gone = false
    let element: StripeCardElement | null = null
    loadStripe()
      .then((stripe: StripeApi) => {
        if (gone || !box.current) return
        const card = stripe.elements().create('card', { hidePostalCode: true })
        element = card
        card.mount(box.current)
        card.on('change', (change) => setProblem(change.error?.message ?? ''))
        forms.current.onForm({
          async createPaymentMethod() {
            const made = await stripe.createPaymentMethod({ type: 'card', card })
            return made.paymentMethod ? { id: made.paymentMethod.id } : { error: made.error?.message ?? 'We could not read that card. Check it and try again.' }
          },
        })
      })
      .catch(() => forms.current.onUnavailable())
    return () => {
      gone = true
      element?.destroy()
      forms.current.onForm(null)
    }
  }, [])

  return (
    <div className="field">
      <label id="stripe-card-label">Card</label>
      <div ref={box} className="stripe-card" aria-labelledby="stripe-card-label" />
      {problem && <p className="field__error">{problem}</p>}
    </div>
  )
}
