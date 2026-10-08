import { describe, expect, it } from 'vitest'
import { cardToken, formatCardNumber, formatExpiry, validateCard } from './card'

describe('cardToken', () => {
  it('maps the test cards to the provider tokens, however they are typed', () => {
    expect(cardToken('4242 4242 4242 4242')).toBe('tok_visa')
    expect(cardToken('4242424242424242')).toBe('tok_visa')
    expect(cardToken('4000-0000-0000-0002')).toBe('tok_declined')
    expect(cardToken('4000 0000 0000 9995')).toBe('tok_insufficient_funds')
    expect(cardToken('4000 0000 0000 0119')).toBe('tok_error')
  })

  it('gives any other number a token the provider will not accept', () => {
    expect(cardToken('1234 5678 9012 3456')).toBe('tok_unreadable')
  })
})

describe('formatting as the guest types', () => {
  it('groups the card number in fours and ignores anything that is not a digit', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242')
    expect(formatCardNumber('4242-abc42')).toBe('4242 42')
    expect(formatCardNumber('42')).toBe('42')
  })

  it('puts the slash in the expiry and fixes an obvious month', () => {
    expect(formatExpiry('1228')).toBe('12/28')
    expect(formatExpiry('12')).toBe('12')
    expect(formatExpiry('3')).toBe('03')
    expect(formatExpiry('0328')).toBe('03/28')
  })
})

describe('validateCard', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  const good = { number: '4242 4242 4242 4242', expiry: '12/28', cvc: '123' }

  it('accepts a complete card', () => {
    expect(validateCard(good, now)).toEqual({})
  })

  it('says what is wrong with each field', () => {
    expect(validateCard({ number: '4242', expiry: '', cvc: '1' }, now)).toEqual({
      number: 'Enter the number on your card',
      expiry: 'Enter the expiry as MM/YY',
      cvc: 'Enter the 3 or 4 digit security code',
    })
  })

  it('rejects a month that does not exist and a card that has expired', () => {
    expect(validateCard({ ...good, expiry: '13/28' }, now).expiry).toBe('That month does not exist')
    expect(validateCard({ ...good, expiry: '09/26' }, now).expiry).toBe('That card has expired')
  })

  it('treats a card as good through the end of its expiry month', () => {
    expect(validateCard({ ...good, expiry: '10/26' }, now).expiry).toBeUndefined()
  })
})
