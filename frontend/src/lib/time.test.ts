import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCountdown, formatMinutes, resetServerTime, serverNow, syncServerTime } from './time'

afterEach(() => {
  resetServerTime()
  vi.useRealTimers()
})

describe('server time', () => {
  it('follows the server when this machine is wrong', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
    // The server says it is two minutes later than this laptop thinks.
    syncServerTime('2026-10-08T10:02:00Z')
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-08T10:02:00.000Z')
    vi.advanceTimersByTime(5000)
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-08T10:02:05.000Z')
  })

  it('ignores a value it cannot read', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
    syncServerTime('not a date')
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-08T10:00:00.000Z')
  })
})

describe('formatCountdown', () => {
  it('shows hours, minutes and seconds', () => {
    expect(formatCountdown((21 * 3600 + 42 * 60 + 10) * 1000)).toBe('21:42:10')
    expect(formatCountdown(9000)).toBe('00:00:09')
  })

  it('adds days beyond twenty-four hours', () => {
    expect(formatCountdown((2 * 86400 + 3 * 3600 + 14 * 60 + 5) * 1000)).toBe('2d 03:14:05')
  })

  it('never goes negative', () => {
    expect(formatCountdown(-5000)).toBe('00:00:00')
  })
})

describe('formatMinutes', () => {
  it('shows minutes and seconds for the hold timer', () => {
    expect(formatMinutes(521_000)).toBe('08:41')
    expect(formatMinutes(0)).toBe('00:00')
    expect(formatMinutes(-1)).toBe('00:00')
  })
})
