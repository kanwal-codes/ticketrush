import { describe, expect, it } from 'vitest'
import { fitAttrs, layoutTitle } from './posterLayout'

const opts = { maxLines: 2, width: 276, factor: 0.4, maxSize: 112, minSize: 44 }

describe('layoutTitle', () => {
  it('upper-cases and keeps a short title on one line at full size', () => {
    expect(layoutTitle('Orbit', opts)).toEqual({ lines: ['ORBIT'], size: 112 })
  })

  it('breaks a long title into balanced lines when that makes the type bigger', () => {
    const { lines, size } = layoutTitle('Harbour FC vs Rivière United', opts)
    expect(lines.length).toBe(2)
    expect(lines.join(' ')).toBe('HARBOUR FC VS RIVIÈRE UNITED')
    expect(size).toBeGreaterThan(layoutTitle('Harbour FC vs Rivière United', { ...opts, maxLines: 1 }).size)
  })

  it('does not split a title into more lines than allowed', () => {
    const { lines } = layoutTitle('A very long title with many many words in it indeed', { ...opts, maxLines: 3 })
    expect(lines.length).toBeLessThanOrEqual(3)
  })

  it('never goes below the smallest size', () => {
    expect(layoutTitle('Supercalifragilisticexpialidocious Production', opts).size).toBeGreaterThanOrEqual(44)
  })

  it('copes with an empty title', () => {
    expect(layoutTitle('   ', opts).lines).toEqual([])
  })
})

describe('fitAttrs', () => {
  it('compresses only a line that would overflow', () => {
    expect(fitAttrs('SHORT', 40, 0.4, 276)).toEqual({})
    expect(fitAttrs('A MUCH LONGER LINE OF TEXT', 60, 0.4, 276)).toEqual({ textLength: 276, lengthAdjust: 'spacingAndGlyphs' })
  })
})
