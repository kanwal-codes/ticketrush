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
    expect(size).toBeGreaterThanOrEqual(opts.minSize)
    expect(lines.every((line) => line.length * size * opts.factor <= opts.width + 1)).toBe(true)
  })

  it('cuts a title that is too long for its lines with an ellipsis, rather than squeezing it into something unreadable', () => {
    const long = 'The Extraordinarily Long Titled Orchestra Of The Northern Lights Experience'
    const { lines, size } = layoutTitle(long, opts)
    expect(lines.length).toBeLessThanOrEqual(opts.maxLines)
    expect(lines.at(-1)!.endsWith('…')).toBe(true)
    expect(lines.join(' ').startsWith('THE EXTRAORDINARILY')).toBe(true)
    expect(size).toBeGreaterThanOrEqual(opts.minSize)
    // No line needs squeezing by more than a fifth to fit (the drawing code squeezes such a line to the width).
    expect(lines.every((line) => line.length * size * opts.factor <= opts.width * 1.25)).toBe(true)
  })

  it('does not cut a title that fits, and never cuts down to nothing', () => {
    expect(layoutTitle('Harbour FC vs Rivière United', opts).lines.join(' ')).not.toContain('…')
    const huge = layoutTitle('Supercalifragilisticexpialidocious', opts)
    expect(huge.lines).toEqual(['SUPERCALIFRAGILISTICEXPIALIDOCIOUS'])
    expect(huge.size).toBe(opts.minSize)
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
