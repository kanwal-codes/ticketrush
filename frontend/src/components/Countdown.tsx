import { useEffect, useRef, useState } from 'react'
import { formatCountdown, serverNow } from '../lib/time'

interface Props {
  /** When it ends, as an ISO timestamp. */
  to: string
  /** Called once when it reaches zero. */
  onDone?: () => void
  className?: string
}

/** A countdown on the server's clock. It is a timer, not a live region, so it is not read out every second. */
export function Countdown({ to, onDone, className }: Props) {
  const target = Date.parse(to)
  const [now, setNow] = useState(serverNow)
  const done = useRef(false)

  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 250)
    return () => clearInterval(tick)
  }, [])

  const remaining = target - now
  useEffect(() => {
    if (remaining <= 0 && !done.current) {
      done.current = true
      onDone?.()
    }
    if (remaining > 0) done.current = false
  }, [remaining, onDone])

  return (
    <time className={`num ${className ?? ''}`} dateTime={to} role="timer">
      {formatCountdown(remaining)}
    </time>
  )
}
