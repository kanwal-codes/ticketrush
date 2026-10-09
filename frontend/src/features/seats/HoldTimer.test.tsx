import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetServerTime, syncServerTime } from '../../lib/time'
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
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/7/checkout')
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

  it('does not clear a brand new hold just because it mounted before the server clock was known', () => {
    // Mounted with no hold yet: its clock starts from this machine's own idea of "now".
    show()
    act(() => {
      // The real server turns out to run two hours behind that. A hold arrives relative to its clock, not this
      // machine's: the hold is a healthy 8 minutes 41 seconds from expiring, by the server's own account.
      syncServerTime('2026-10-08T08:00:00Z')
      setActiveHold({ holdId: 55, eventId: 7, expiresAt: '2026-10-08T08:08:41Z' })
    })
    expect(getActiveHold()).not.toBeNull()
    expect(screen.getByRole('timer')).toHaveTextContent('08:41')
  })
})
