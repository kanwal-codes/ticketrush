import { Link } from 'react-router'
import type { EventSummary } from '../../api/types'
import { Countdown } from '../../components/Countdown'
import { Poster } from '../../components/Poster'
import { eventTheme } from '../../lib/eventTheme'
import { formatDate, formatTime } from '../../lib/time'

/** The event people are waiting for, large, with the time left and the way in. */
export function Hero({ event, onTick }: { event: EventSummary; onTick?: () => void }) {
  const waiting = event.saleState === 'UPCOMING' || event.saleState === 'QUEUE_OPEN'
  const cta = event.saleState === 'QUEUE_OPEN' ? 'Join the waiting room' : event.saleState === 'ON_SALE' ? 'Get tickets' : 'See the event'
  return (
    <section className="hero" style={eventTheme(event.poster)} aria-labelledby="hero-title">
      <div className="hero__poster">
        <Poster {...event.poster} style={event.poster.style} title={event.title} artist={event.artist} city={event.city} startsAt={event.startsAt} seed={event.id} />
      </div>
      <div className="hero__body">
        <p className="label hero__kicker">{waiting ? `Drops ${formatDate(event.onSaleAt)} at ${formatTime(event.onSaleAt)}` : 'On sale now'}</p>
        <h2 id="hero-title" className="hero__title">
          {event.title}
        </h2>
        {event.artist.toLowerCase() !== event.title.toLowerCase() && <p className="hero__artist">{event.artist}</p>}
        <p className="hero__meta">
          {formatDate(event.startsAt)} · {event.venueName}, {event.city}
        </p>
        {waiting && (
          <p className="hero__countdown">
            <Countdown to={event.onSaleAt} className="hero__clock" onDone={onTick} />
            <span className="label">until tickets go on sale</span>
          </p>
        )}
        <Link to={`/events/${event.id}`} className="btn">
          {cta}
        </Link>
        {waiting && <p className="hero__note">The queue opens at {formatTime(event.dropOpensAt)}, and people get in by arrival time. A refresh keeps your place.</p>}
      </div>
    </section>
  )
}
