import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerTime, syncServerTime } from '../lib/time'
import { Countdown } from './Countdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
})

afterEach(() => {
  resetServerTime()
  vi.useRealTimers()
})

describe('Countdown', () => {
  it('counts down second by second', () => {
    render(<Countdown to="2026-10-08T10:00:10Z" />)
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:10')
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:07')
  })

  it('calls onDone once when it reaches zero, and stays at zero', () => {
    const onDone = vi.fn()
    render(<Countdown to="2026-10-08T10:00:02Z" onDone={onDone} />)
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:00')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('follows the server clock, not a laptop that is wrong', () => {
    // The server says it is already ten seconds later than this laptop thinks.
    syncServerTime('2026-10-08T10:00:10Z')
    render(<Countdown to="2026-10-08T10:00:30Z" />)
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:20')
  })

  it('carries the end time for assistive technology', () => {
    render(<Countdown to="2026-10-09T10:00:00Z" />)
    expect(screen.getByRole('timer')).toHaveAttribute('datetime', '2026-10-09T10:00:00Z')
  })
})
