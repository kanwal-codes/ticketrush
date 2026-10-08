import { describe, expect, it } from 'vitest'
import { formatCode } from './format'

describe('formatCode', () => {
  it('groups a code in fours', () => {
    expect(formatCode('ABCD1234EFGH5678JKMN9PQRST')).toBe('ABCD 1234 EFGH 5678 JKMN 9PQR ST')
  })

  it('leaves a short code alone', () => {
    expect(formatCode('AB12')).toBe('AB12')
  })
})
