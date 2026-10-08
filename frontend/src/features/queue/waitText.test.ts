import { describe, expect, it } from 'vitest'
import { aheadText, waitText } from './waitText'

describe('waitText', () => {
  it('says under a minute for short waits', () => {
    expect(waitText(0)).toBe('Under a minute')
    expect(waitText(59)).toBe('Under a minute')
  })

  it('rounds to whole minutes', () => {
    expect(waitText(60)).toBe('About 1 min')
    expect(waitText(250)).toBe('About 4 min')
  })

  it('switches to hours for long waits', () => {
    expect(waitText(3600)).toBe('About 1 h')
    expect(waitText(5400)).toBe('About 1 h 30 min')
  })
})

describe('aheadText', () => {
  it('handles none, one and many', () => {
    expect(aheadText(0)).toBe('You are next')
    expect(aheadText(1)).toBe('1 person ahead of you')
    expect(aheadText(1312)).toBe('1,312 people ahead of you')
  })
})
