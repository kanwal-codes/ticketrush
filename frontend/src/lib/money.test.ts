import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

describe('formatMoney', () => {
  it('shows whole cents as dollars with two decimals', () => {
    expect(formatMoney(13760)).toBe('$137.60')
    expect(formatMoney(4515)).toBe('$45.15')
    expect(formatMoney(100)).toBe('$1.00')
  })

  it('handles zero and thousands', () => {
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(123456)).toBe('$1,234.56')
  })
})
