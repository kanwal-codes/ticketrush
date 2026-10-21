import { Link } from 'react-router'
import type { EventSummary } from '../../api/types'
import { Poster } from '../../components/Poster'
import { formatDateShort } from '../../lib/time'
import { categoryOf } from './browse'
import { useEventNavigation } from './useEventNavigation'

interface Props {
  event: EventSummary
  /** Position in the grid, for the staggered entrance. */
  index?: number
}

export function EventCard({ event, index = 0 }: Props) {
  const { warm, open } = useEventNavigation(event.id)
  return (
    <li className="card enter" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
      <Link to={`/events/${event.id}`} className="card__link" onPointerEnter={warm} onFocus={warm} onClick={open} viewTransition>
        <div className="card__poster" style={{ viewTransitionName: `poster-${event.id}` }}>
          <Poster {...event.poster} style={event.poster.style} title={event.title} artist={event.artist} city={event.city} startsAt={event.startsAt} seed={event.id} />
        </div>
        <div className="card__body">
          <div>
            <p className="card__category">{categoryOf(event)}</p>
            <h3 className="card__title">{event.title}</h3>
            <time className="card__date" dateTime={event.startsAt}>{formatDateShort(event.startsAt)}</time>
            <p className="card__venue">
              {event.venueName}, {event.city}
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
