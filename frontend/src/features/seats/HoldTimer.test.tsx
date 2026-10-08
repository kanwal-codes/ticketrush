import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerTime } from '../../lib/time'
import { clearActiveHold, getActiveHold, setActiveHold } from './activeHold'
import { HoldTimer } from './HoldTimer'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
})

afterEach(() => {
  clearActiveHold()
  resetServerTime()
  vi.useRealTimers()
})

const show = () =>
  render(
    <MemoryRouter>
      <HoldTimer />
    </MemoryRouter>,
  )

describe('HoldTimer', () => {
  it('shows nothing when no seats are held', () => {
    show()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('counts down the hold and links back to checkout', () => {
    setActiveHold({ holdId: 55, eventId: 7, expiresAt: '2026-10-08T10:08:41Z' })
    show()
    expect(screen.getByRole('timer')).toHaveTextContent('08:41')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/checkout/55')
    act(() => void vi.advanceTimersByTime(2000))
    expect(screen.getByRole('timer')).toHaveTextContent('08:39')
  })

  it('disappears, and forgets the hold, when time runs out', () => {
    setActiveHold({ holdId: 55, eventId: 7, expiresAt: '2026-10-08T10:00:02Z' })
    show()
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(getActiveHold()).toBeNull()
  })
})
