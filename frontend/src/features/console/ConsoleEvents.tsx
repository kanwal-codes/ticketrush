import { Link } from 'react-router'
import type { EventRow } from '../../api/types'
import { ConsoleSkeleton } from '../../components/PageSkeletons'
import { Notice } from '../../components/Notice'
import { describeError } from '../../lib/errorCopy'
import { formatMoney } from '../../lib/money'
import { formatDate } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { useMyEvents } from './api'
import './console.css'

const STATUS: Record<EventRow['status'], string> = { DRAFT: 'Draft', PUBLISHED: 'On sale', CANCELLED: 'Cancelled' }

/** The organizer's own events, drafts included, newest event first. */
export function ConsoleEvents() {
  useTitle('Console · TicketRush')
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useMyEvents()
  const events = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="page console">
      <header className="console__head">
        <div>
          <p className="label">Console</p>
          <h1>Your events</h1>
        </div>
        <Link to="/console/events/new" className="btn" viewTransition>
          Create an event
        </Link>
      </header>

      {isPending ? (
        <ConsoleSkeleton />
      ) : error ? (
        (() => {
          const d = describeError(error, 'your events')
          return (
            <Notice tone={d.tone} title={d.title} actions={<button type="button" className="btn btn--quiet" onClick={() => void refetch()}>Try again</button>}>
              {d.message}
            </Notice>
          )
        })()
      ) : events.length === 0 ? (
        <div className="console__empty">
          <h2>No events yet</h2>
          <p>Create one, check how its poster looks, then publish it when it is ready. Nothing is visible to guests until you do.</p>
          <Link to="/console/events/new" className="btn" viewTransition>
            Create your first event
          </Link>
        </div>
      ) : (
        <ul className="console__events">
          {events.map((event, i) => (
            <li key={event.id} className="console__event enter" style={{ '--i': i } as React.CSSProperties}>
              <Link to={`/console/events/${event.id}`} viewTransition>
                <span className={`status status--${event.status.toLowerCase()}`}>{STATUS[event.status]}</span>
                <h2>{event.title}</h2>
                <p className="console__meta">
                  {formatDate(event.startsAt)} · {event.venueName}, {event.city}
                </p>
                <p className="console__numbers num">
                  <span>
                    {event.sold.toLocaleString('en-CA')} of {event.capacity.toLocaleString('en-CA')} sold
                  </span>
                  <span>{formatMoney(event.grossCents)}</span>
                </p>
                <span className="console__bar" aria-hidden="true">
                  <span style={{ '--p': event.capacity ? event.sold / event.capacity : 0 } as React.CSSProperties} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <p className="console__more">
          <button type="button" className="btn btn--quiet" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Show more events'}
          </button>
        </p>
      )}
    </div>
  )
}
