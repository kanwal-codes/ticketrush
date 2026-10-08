import { useEffect, useRef, useState } from 'react'
import { useConnection } from '../api/connection'
import { Icon } from './Icon'
import './connection.css'

/**
 * A bar that slides down when the guest cannot reach us, says their place and seats are kept, and says so when it is
 * back. It is a polite live region: it informs a screen reader without cutting across what it was reading.
 */
export function ConnectionBar() {
  const { offline, unreachable } = useConnection()
  const bad = offline || unreachable
  const [recovered, setRecovered] = useState(false)
  const wasBad = useRef(false)

  useEffect(() => {
    if (bad) {
      wasBad.current = true
      return
    }
    if (!wasBad.current) return
    wasBad.current = false
    setRecovered(true)
    const timer = setTimeout(() => setRecovered(false), 2800)
    return () => clearTimeout(timer)
  }, [bad])

  const text = offline ? 'You are offline.' : unreachable ? 'We cannot reach TicketRush right now.' : 'You are back online.'
  const detail = bad ? 'Your place in line and any seats you hold are kept. We will reconnect as soon as we can.' : ''

  return (
    <div className="connection" role="status" aria-live="polite">
      {(bad || recovered) && (
        <div className={`connection__bar ${bad ? 'connection__bar--bad' : 'connection__bar--ok'}`}>
          <Icon name={bad ? 'offline' : 'success'} size={18} />
          <span>
            <strong>{text}</strong> {detail}
          </span>
        </div>
      )}
    </div>
  )
}
