import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerTime } from '../../lib/time'
import { clearAdmission, getAdmission, saveAdmission } from './admission'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
})

afterEach(() => {
  resetServerTime()
  vi.useRealTimers()
})

describe('admission', () => {
  it('keeps the token until it runs out', () => {
    saveAdmission(7, 'tok', '2026-10-08T10:10:00Z')
    expect(getAdmission(7)).toBe('tok')
    vi.setSystemTime(new Date('2026-10-08T10:09:59Z'))
    expect(getAdmission(7)).toBe('tok')
    vi.setSystemTime(new Date('2026-10-08T10:10:01Z'))
    expect(getAdmission(7)).toBeNull()
  })

  it('keeps one token per event', () => {
    saveAdmission(7, 'seven', '2026-10-08T10:10:00Z')
    saveAdmission(8, 'eight', '2026-10-08T10:10:00Z')
    expect(getAdmission(7)).toBe('seven')
    expect(getAdmission(8)).toBe('eight')
    clearAdmission(7)
    expect(getAdmission(7)).toBeNull()
    expect(getAdmission(8)).toBe('eight')
  })

  it('assumes a short life when the server gave no end time', () => {
    saveAdmission(7, 'tok', null)
    expect(getAdmission(7)).toBe('tok')
    vi.setSystemTime(new Date('2026-10-08T10:06:00Z'))
    expect(getAdmission(7)).toBeNull()
  })

  it('has nothing for an event the guest never joined', () => {
    expect(getAdmission(99)).toBeNull()
  })
})
