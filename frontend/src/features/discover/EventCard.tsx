import { Link } from 'react-router'
import type { EventSummary } from '../../api/types'
import { Poster } from '../../components/Poster'
import { formatMoney } from '../../lib/money'
import { formatChip } from '../../lib/time'

export function EventCard({ event }: { event: EventSummary }) {
  const chip = formatChip(event.startsAt)
  return (
    <li className="card">
      <Link to={`/events/${event.id}`} className="card__link">
        <div className="card__poster">
          <Poster {...event.poster} style={event.poster.style} title={event.title} artist={event.artist} city={event.city} startsAt={event.startsAt} seed={event.id} />
        </div>
        <div className="card__body">
          <span className="chip" aria-hidden="true">
            <span className="chip__month">{chip.month}</span>
            <span className="chip__day">{chip.day}</span>
          </span>
          <div>
            <h3 className="card__title">{event.title}</h3>
            <p className="card__venue">
              {event.venueName}, {event.city}
            </p>
            <p className="card__price">
              <span className="num">From {formatMoney(event.fromAllInCents)}</span> <span className="label">with fees</span>
            </p>
          </div>
        </div>
      </Link>
    </li>
  )
}

export function EventCardSkeleton() {
  return (
    <li className="card" aria-hidden="true">
      <div className="card__poster skeleton" />
      <div className="skeleton" style={{ height: 20, marginTop: 12, width: '70%' }} />
      <div className="skeleton" style={{ height: 14, marginTop: 8, width: '50%' }} />
    </li>
  )
}
