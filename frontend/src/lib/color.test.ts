import { describe, expect, it } from 'vitest'
import { contrast, onColor, readable } from './color'

describe('contrast', () => {
  it('is 21 for black on white and 1 for the same color', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('does not depend on the order', () => {
    expect(contrast('#2b2fd9', '#ffd9c4')).toBeCloseTo(contrast('#ffd9c4', '#2b2fd9'), 5)
  })
})

describe('onColor', () => {
  it('puts white on dark colors and black on light ones', () => {
    expect(onColor('#0e4d3a')).toBe('#ffffff')
    expect(onColor('#ffc20e')).toBe('#121212')
  })
})

describe('readable', () => {
  it('keeps the wanted color when it is legible', () => {
    expect(readable('#2b2fd9', '#ffd9c4')).toBe('#2b2fd9')
  })

  it('falls back to black or white when it is not', () => {
    expect(readable('#ffd9c4', '#ffe0cc')).toBe('#121212')
    expect(readable('#111122', '#101b3a')).toBe('#ffffff')
  })
})
