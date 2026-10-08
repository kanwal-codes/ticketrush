/**
 * Card details never leave this page. The mock payment provider takes a token instead, and these are the test card
 * numbers that stand for each of its behaviours (the same numbers real providers publish for their test modes).
 * Any other number becomes a token the provider rejects as unreadable.
 */
export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', token: 'tok_visa', means: 'Payment succeeds' },
  { number: '4000 0000 0000 0002', token: 'tok_declined', means: 'Card is declined' },
  { number: '4000 0000 0000 9995', token: 'tok_insufficient_funds', means: 'Insufficient funds' },
  { number: '4000 0000 0000 0119', token: 'tok_error', means: 'Provider error: the outcome is unknown' },
  { number: '4000 0000 0000 0259', token: 'tok_slow', means: 'Succeeds, but slowly' },
] as const

export const digitsOnly = (value: string) => value.replace(/\D/g, '')

export function cardToken(cardNumber: string): string {
  const digits = digitsOnly(cardNumber)
  return TEST_CARDS.find((c) => digitsOnly(c.number) === digits)?.token ?? 'tok_unreadable'
}

/** "4242424242424242" typed as the guest goes becomes "4242 4242 4242 4242". */
export function formatCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
}

/** "1228" becomes "12/28"; a month that is clearly wrong gets a leading zero ("3" becomes "03/"). */
export function formatExpiry(value: string): string {
  let digits = digitsOnly(value).slice(0, 4)
  if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export interface CardErrors {
  number?: string
  expiry?: string
  cvc?: string
}

export function validateCard(card: { number: string; expiry: string; cvc: string }, now: Date = new Date()): CardErrors {
  const errors: CardErrors = {}
  const n = digitsOnly(card.number)
  if (n.length < 13 || n.length > 19) errors.number = 'Enter the number on your card'

  const m = /^(\d{2})\/(\d{2})$/.exec(card.expiry)
  if (!m) errors.expiry = 'Enter the expiry as MM/YY'
  else {
    const month = Number(m[1])
    const year = 2000 + Number(m[2])
    // A card is good through the last day of its expiry month.
    if (month < 1 || month > 12) errors.expiry = 'That month does not exist'
    else if (new Date(year, month, 1).getTime() <= now.getTime()) errors.expiry = 'That card has expired'
  }

  if (!/^\d{3,4}$/.test(card.cvc)) errors.cvc = 'Enter the 3 or 4 digit security code'
  return errors
}
