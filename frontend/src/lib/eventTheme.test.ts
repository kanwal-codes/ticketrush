import { describe, expect, it } from 'vitest'
import { contrast } from './color'
import { eventTheme, textInk } from './eventTheme'

const poster = (inkOne: string, inkTwo: string, paperColor = '#ffd9c4') => ({ style: 'ORBIT' as const, inkOne, inkTwo, paperColor })

describe('textInk', () => {
  it('uses the first ink when it reads well on the page', () => {
    expect(textInk(poster('#2b2fd9', '#ff5a36'))).toBe('#2b2fd9')
  })

  it('falls back to the second ink, then to plain ink, when the first is too pale', () => {
    expect(textInk(poster('#5cf2b0', '#3f2bd9'))).toBe('#3f2bd9')
    expect(textInk(poster('#5cf2b0', '#ffc20e'))).toBe('#121212')
  })
})

describe('eventTheme', () => {
  it('keeps text on the event ink legible even for a mid-tone organizer color', () => {
    const style = eventTheme(poster('#3f6bff', '#5cf2b0', '#101b3a')) as Record<string, string>
    expect(contrast(style['--on-ev']!, style['--ev']!)).toBeGreaterThanOrEqual(4.5)
  })

  it('sets the variables the pages use, with readable text on the event paper and on the ink', () => {
    const style = eventTheme(poster('#0e4d3a', '#f08fa8', '#101b3a')) as Record<string, string>
    expect(style['--ev']).toBe('#0e4d3a')
    expect(style['--ev-paper']).toBe('#101b3a')
    expect(style['--on-ev-paper']).toBe('#ffffff')
    expect(style['--on-ev']).toBe('#ffffff')
    expect(style['--ev-text']).toBe('#0e4d3a')
  })
})
