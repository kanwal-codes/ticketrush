import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatMinutes, serverNow } from '../../lib/time'
import { clearActiveHold, useActiveHold } from './activeHold'

/** The same clock where the guest decides to pay: big, at the top of the order summary, saying what happens at zero. */
export function HoldClock({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 500)
    return () => clearInterval(tick)
  }, [])
  const remaining = Date.parse(expiresAt) - now
  return (
    <p className={`hold-clock${remaining < 60_000 ? ' hold-clock--urgent' : ''}`}>
      <span className="label">Your seats are held for</span>
      <time className="num hold-clock__time" role="timer" aria-label={`Seats held for ${formatMinutes(remaining)}`}>{formatMinutes(remaining)}</time>
      <span className="hold-clock__note">After that they go back on sale.</span>
    </p>
  )
}

/** "Held for 08:41", in the nav on every page while the guest has seats held, linking back to checkout. */
export function HoldTimer() {
  const hold = useActiveHold()
  const [now, setNow] = useState(serverNow)

  useEffect(() => {
    if (!hold) return
    const tick = setInterval(() => setNow(serverNow()), 500)
    return () => clearInterval(tick)
  }, [hold])

  const remaining = hold ? Date.parse(hold.expiresAt) - now : 0
  useEffect(() => {
    if (hold && remaining <= 0) clearActiveHold()
  }, [hold, remaining])

  if (!hold || remaining <= 0) return null
  return (
    <Link to={`/events/${hold.eventId}/checkout`} className={`hold-timer${remaining < 60_000 ? ' hold-timer--urgent' : ''}`}>
      <span className="label">Held for</span> <time className="num" role="timer" aria-label={`Seats held for ${formatMinutes(remaining)}`}>{formatMinutes(remaining)}</time>
    </Link>
  )
}
