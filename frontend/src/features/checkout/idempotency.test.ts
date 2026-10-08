import { describe, expect, it } from 'vitest'
import { endAttempt, keyFor } from './idempotency'

describe('idempotency key lifecycle', () => {
  it('gives the same attempt the same key, so a retry cannot charge twice', () => {
    const first = keyFor(55, 'tok_visa')
    expect(keyFor(55, 'tok_visa')).toBe(first)
    expect(keyFor(55, 'tok_visa')).toBe(first)
  })

  it('gives a different card a different key', () => {
    const visa = keyFor(55, 'tok_visa')
    const other = keyFor(55, 'tok_declined')
    expect(other).not.toBe(visa)
    // And going back to the first card is a new attempt too, because the stored one is now the other card's.
    expect(keyFor(55, 'tok_visa')).not.toBe(visa)
  })

  it('starts a new attempt after the server has given a final answer', () => {
    const first = keyFor(55, 'tok_visa')
    endAttempt(55)
    expect(keyFor(55, 'tok_visa')).not.toBe(first)
  })

  it('keeps holds apart', () => {
    expect(keyFor(55, 'tok_visa')).not.toBe(keyFor(56, 'tok_visa'))
  })

  it('survives a refresh, because it lives in the tab\'s storage', () => {
    const key = keyFor(55, 'tok_visa')
    expect(JSON.parse(sessionStorage.getItem('tr.idem.55') ?? '{}')).toEqual({ token: 'tok_visa', key })
  })

  it('makes keys the server accepts (8 to 64 characters, letters, digits and . _ : -)', () => {
    expect(keyFor(55, 'tok_visa')).toMatch(/^[A-Za-z0-9._:-]{8,64}$/)
  })
})
