import { Link } from 'react-router'
import type { EventSummary } from '../../api/types'
import { Countdown } from '../../components/Countdown'
import { formatDateShort, formatTime } from '../../lib/time'
import { useEventNavigation } from './useEventNavigation'

/** The banner is one illustration of a night out (the picture is cropped to fit, so it carries no lettering); the live event supplies its title and booking state. */
export function Hero({ event, onTick }: { event: EventSummary; onTick?: () => void }) {
  const { warm, open } = useEventNavigation(event.id)
  const waiting = event.saleState === 'UPCOMING' || event.saleState === 'QUEUE_OPEN'
  const cta = event.saleState === 'QUEUE_OPEN' ? 'Join the waiting room' : event.saleState === 'ON_SALE' ? 'Explore this event' : 'See the event'
  return (
    <section className="hero" aria-labelledby="hero-title" onPointerEnter={warm} onFocusCapture={warm}>
      <div className="hero__lead">
        <p className="hero__edition">Events, everywhere</p>
        <h1>Find something worth showing up for.</h1>
        <p className="hero__description">Concerts, sports, theatre and local events. Find your next thing.</p>
        <Link to={`/events/${event.id}`} className="btn hero__cta" onClick={open} viewTransition>{cta}<span aria-hidden="true">↗</span></Link>
        {waiting && <p className="hero__drop">Tickets go on sale {formatDateShort(event.onSaleAt)} at {formatTime(event.onSaleAt)} <Countdown to={event.onSaleAt} onDone={onTick} /></p>}
      </div>
      <Link to={`/events/${event.id}`} className="hero__feature" onClick={open} viewTransition>
        <img className="hero__image" src="/hero/scene.webp" alt="" decoding="async" />
        <div className="hero__caption">
          <span className="hero__caption-label">Featured / {event.city}</span>
          <h2 id="hero-title">{event.title}</h2>
          <span className="hero__caption-meta">{formatDateShort(event.startsAt)} / {event.venueName}</span>
        </div>
      </Link>
    </section>
  )
}
