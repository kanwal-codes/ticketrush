import { describe, expect, it } from 'vitest'
import { contrast, onColor, readable, withReadableText } from './color'

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

describe('withReadableText', () => {
  it('leaves a fill alone when its text already passes', () => {
    expect(withReadableText('#0e4d3a')).toEqual({ fill: '#0e4d3a', text: '#ffffff' })
  })

  it('nudges a mid-tone fill that fails against both black and white', () => {
    // A medium blue: 4.4:1 with white and no better with black.
    expect(contrast('#ffffff', '#3f6bff')).toBeLessThan(4.5)
    expect(contrast('#121212', '#3f6bff')).toBeLessThan(4.5)
    const { fill, text } = withReadableText('#3f6bff')
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5)
    expect(fill).not.toBe('#3f6bff')
  })

  it('always ends with readable text, whatever the color', () => {
    for (const color of ['#777777', '#808080', '#ff5a36', '#5cf2b0', '#e4002b', '#f08fa8', '#c2410c', '#2b2fd9']) {
      const { fill, text } = withReadableText(color)
      expect(contrast(text, fill), color).toBeGreaterThanOrEqual(4.5)
    }
  })
})
