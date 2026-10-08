import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerTime } from '../../lib/time'
import { clearActiveHold, getActiveHold, parseActiveHold, setActiveHold } from './activeHold'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
})

afterEach(() => {
  clearActiveHold()
  resetServerTime()
  vi.useRealTimers()
})

describe('active hold', () => {
  it('remembers a hold until it runs out', () => {
    setActiveHold({ holdId: 5, eventId: 7, expiresAt: '2026-10-08T10:10:00Z' })
    expect(getActiveHold()).toEqual({ holdId: 5, eventId: 7, expiresAt: '2026-10-08T10:10:00Z' })
    vi.setSystemTime(new Date('2026-10-08T10:10:01Z'))
    expect(getActiveHold()).toBeNull()
  })

  it('can be cleared', () => {
    setActiveHold({ holdId: 5, eventId: 7, expiresAt: '2026-10-08T10:10:00Z' })
    clearActiveHold()
    expect(getActiveHold()).toBeNull()
  })

  it('treats damaged storage as no hold', () => {
    expect(parseActiveHold('not json')).toBeNull()
    expect(parseActiveHold('{"holdId":"x"}')).toBeNull()
    expect(parseActiveHold(null)).toBeNull()
  })
})
