import { api } from '../../api/client'
import type { OrderView } from '../../api/types'
import { cardToken } from '../../lib/card'
import { endAttempt, keyFor } from './idempotency'

/** Every way a payment attempt can come back, in terms the screen can act on. */
export type PaymentOutcome =
  | { kind: 'paid'; order: OrderView }
  | { kind: 'declined'; order: OrderView; message: string }
  /** The provider has not said yet. The guest may or may not have been charged: wait, do not pay again. */
  | { kind: 'pending'; order: OrderView }
  /** The charge went through but the seats had been lost, so the money is being or has been returned. */
  | { kind: 'refunded'; order: OrderView; refunding: boolean }
  | { kind: 'holdGone'; message: string }
  | { kind: 'inProgress'; message: string }
  /** No answer, or a server fault. Nothing is known, and retrying with the same key is safe. */
  | { kind: 'unknown'; message: string }
  | { kind: 'rejected'; message: string }

const isOrder = (body: unknown): body is OrderView =>
  typeof body === 'object' && body !== null && typeof (body as OrderView).status === 'string' && 'reference' in body

export function declineMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'card_declined':
      return 'Your card was declined. Try another card.'
    case 'insufficient_funds':
      return 'There are not enough funds on that card. Try another card.'
    case 'invalid_payment_token':
      return 'We could not read that card number. Check it and try again.'
    default:
      return 'The payment did not go through. Try another card.'
  }
}

/** The outcome for an order in a given state. Also used when asking again about a payment that was pending. */
export function outcomeOf(order: OrderView, holdId: number): PaymentOutcome {
  switch (order.status) {
    case 'PAID':
      endAttempt(holdId)
      return { kind: 'paid', order }
    case 'FAILED':
      endAttempt(holdId)
      return { kind: 'declined', order, message: declineMessage(order.failureReason) }
    case 'REFUNDING':
    case 'REFUNDED':
      endAttempt(holdId)
      return { kind: 'refunded', order, refunding: order.status === 'REFUNDING' }
    default:
      return { kind: 'pending', order }
  }
}

const NO_ANSWER =
  'We could not confirm whether your payment went through. You will not be charged twice: press the button to check again.'

/**
 * Pays for the hold with the card. Safe to call again for the same card after any outcome that is not final.
 * The card number is turned into a token here and never sent.
 */
export async function submitPayment(holdId: number, cardNumber: string): Promise<PaymentOutcome> {
  const token = cardToken(cardNumber)
  const key = keyFor(holdId, token)

  let result
  try {
    result = await api.POST('/api/orders', {
      params: { header: { 'Idempotency-Key': key } },
      body: { holdId, paymentToken: token },
    })
  } catch {
    return { kind: 'unknown', message: NO_ANSWER }
  }

  const { data, error, response } = result
  const body: unknown = data ?? error
  const status = response.status

  if (status >= 500) return { kind: 'unknown', message: NO_ANSWER }
  if (isOrder(body)) return outcomeOf(body, holdId) // 200, 201, 202, 402 and 409-with-an-order all carry the order

  const problem = (body ?? {}) as { title?: string; detail?: string }
  const message = problem.detail ?? 'Something went wrong. Try again.'
  if (status === 409 && problem.title === 'Payment in progress') return { kind: 'inProgress', message }
  if (status === 409 || status === 404) {
    endAttempt(holdId)
    return { kind: 'holdGone', message }
  }
  // 422 means the server saw this key with a different request; a fresh key resolves it.
  endAttempt(holdId)
  return { kind: 'rejected', message: status === 401 ? 'Please sign in again to finish paying.' : message }
}

/** Asks the server where a pending order stands. Reading, not paying: it cannot charge anyone. */
export async function checkOrder(orderId: number, holdId: number): Promise<PaymentOutcome> {
  try {
    const { data, response } = await api.GET('/api/orders/{id}', { params: { path: { id: orderId } } })
    if (data) return outcomeOf(data, holdId)
    return response.status >= 500 ? { kind: 'unknown', message: NO_ANSWER } : { kind: 'rejected', message: 'We could not find that order.' }
  } catch {
    return { kind: 'unknown', message: NO_ANSWER }
  }
}
