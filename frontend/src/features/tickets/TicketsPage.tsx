import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useEventsById } from '../../api/queries'
import type { MyTicket } from '../../api/types'
import { eventTheme } from '../../lib/eventTheme'
import { formatMoney } from '../../lib/money'
import { useTitle } from '../../lib/useTitle'
import { useTickets } from './api'
import { TicketStub } from './TicketStub'
import './tickets.css'

export function TicketsPage() {
  useTitle('My tickets · TicketRush')
  const { state } = useLocation() as { state: { paid?: { reference: string; totalCents: number } } | null }
  const tickets = useTickets()
  const paid = state?.paid

  const byEvent = useMemo(() => {
    const groups = new Map<number, MyTicket[]>()
    for (const t of tickets.data ?? []) groups.set(t.eventId, [...(groups.get(t.eventId) ?? []), t])
    return [...groups.entries()]
  }, [tickets.data])
  const events = useEventsById(byEvent.map(([id]) => id))

  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // After paying, put the guest's attention on the confirmation.
    if (paid) heading.current?.focus()
  }, [paid])

  if (tickets.error && !tickets.data) throw tickets.error

  return (
    <div className="page tickets">
      {paid && (
        <section className="confirmation" aria-labelledby="paid-heading">
          <h1 id="paid-heading" ref={heading} tabIndex={-1}>
            You are going!
          </h1>
          <p>
            Order <strong className="num">{paid.reference}</strong>, {formatMoney(paid.totalCents)} paid. Your tickets are below. Show the code at the door.
          </p>
        </section>
      )}
      {!paid && <h1>My tickets</h1>}

      {tickets.isPending ? (
        <div className="skeleton tickets__skeleton" aria-busy="true" aria-label="Loading your tickets" />
      ) : byEvent.length === 0 ? (
        <div className="tickets__empty">
          <p>No tickets yet.</p>
          <p style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/" className="btn">
              See what is on
            </Link>
          </p>
        </div>
      ) : (
        byEvent.map(([eventId, list], i) => {
          const event = events[i]?.data
          return (
            <section key={eventId} className="tickets__event" style={event ? eventTheme(event.poster) : undefined} aria-label={event?.title ?? 'Tickets'}>
              {event && (
                <header>
                  <h2 className="tickets__title">{event.title}</h2>
                </header>
              )}
              {event ? (
                <ul className="stubs">
                  {list.map((t) => (
                    <TicketStub key={t.id} ticket={t} event={event} />
                  ))}
                </ul>
              ) : (
                <div className="skeleton tickets__skeleton" aria-busy="true" />
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
