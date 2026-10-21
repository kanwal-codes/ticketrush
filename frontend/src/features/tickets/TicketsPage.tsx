import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { useEventsById } from '../../api/queries'
import type { MyTicket, PosterView } from '../../api/types'
import { WalletSkeleton } from '../../components/PageSkeletons'
import { eventTheme } from '../../lib/eventTheme'
import { Notice } from '../../components/Notice'
import { formatMoney } from '../../lib/money'
import { useTitle } from '../../lib/useTitle'
import { useTickets } from './api'
import { TicketStub } from './TicketStub'
import './tickets.css'

export function TicketsPage() {
  useTitle('My tickets · TicketRush')
  const { state } = useLocation() as { state: { paid?: { reference: string; totalCents: number; poster?: PosterView } } | null }
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
  if (tickets.isPending && !paid) return <WalletSkeleton />

  return (
    <div className="page tickets">
      {paid && (
        <section className="confirmation" style={paid.poster ? eventTheme(paid.poster) : undefined} aria-labelledby="paid-heading">
          <h1 id="paid-heading" ref={heading} tabIndex={-1}>
            You are going!
          </h1>
          <p>
            Order <strong className="num">{paid.reference}</strong> is confirmed. Total paid: {formatMoney(paid.totalCents)}. Show your ticket’s QR code at the door.
          </p>
        </section>
      )}
      {!paid && <><p className="tickets__eyebrow">Your admission</p><h1>Your event, in hand.</h1><p className="tickets__lead">Your event details and entry code, ready when you are.</p></>}

      {tickets.isPending ? (
        <div className="skeleton tickets__skeleton" aria-busy="true" aria-label="Loading your tickets" />
      ) : byEvent.length === 0 ? (
        <div className="tickets__empty">
          <h2>No tickets yet</h2>
          <p>Tickets you buy will appear here, ready for your event.</p>
          <p style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/" className="btn">
              Find an event
            </Link>
          </p>
        </div>
      ) : (
        byEvent.map(([eventId, list], i) => {
          const event = events[i]?.data
          return (
            <section key={eventId} className="tickets__event" style={event ? eventTheme(event.poster) : undefined} aria-label={event?.title ?? 'Tickets'}>
              {event?.cancelled && (
                <header>
                  <Notice tone="warning" title="This event was cancelled" compact>
                    These tickets no longer work. Your money is being returned to your card automatically.
                  </Notice>
                </header>
              )}
              {event ? (
                <ul className="stubs">
                  {list.map((t, i) => (
                    <TicketStub key={t.id} ticket={t} event={event} index={i} />
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
