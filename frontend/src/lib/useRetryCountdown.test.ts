import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRetryCountdown } from './useRetryCountdown'

describe('useRetryCountdown', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('counts whole seconds down to zero and stops', () => {
    const { result } = renderHook(() => useRetryCountdown())
    act(() => result.current[1](2.2))
    expect(result.current[0]).toBe(3)
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current[0]).toBe(2)
    for (let i = 0; i < 3; i++) act(() => void vi.advanceTimersByTime(1000))
    expect(result.current[0]).toBe(0)
  })
})
