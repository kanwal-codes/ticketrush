import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { keys, useEvent } from '../../api/queries'
import type { EventDetail, TierView } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { Countdown } from '../../components/Countdown'
import { Poster } from '../../components/Poster'
import { HOLD_MINUTES } from '../../lib/constants'
import { eventTheme } from '../../lib/eventTheme'
import { formatMoney } from '../../lib/money'
import { formatDate, formatTime } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { saleView } from './saleView'
import './event.css'

export function EventPage() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <EventView id={id} /> : <NotFound />
}

function EventView({ id }: { id: number }) {
  const { data: event, error } = useEvent(id)
  useTitle(event ? `${event.title} · TicketRush` : 'TicketRush')
  // An unknown event or a failed request goes to the error screen, which says what happened.
  if (error && !event) throw error
  if (!event) return <EventSkeleton />
  return <EventDetails event={event} />
}

function EventDetails({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient()
  const sale = saleView(event)
  return (
    <div className="page event" style={eventTheme(event.poster)}>
      <p>
        <Link to="/" className="event__back">
          ← All events
        </Link>
      </p>
      <div className="event__layout">
        <div className="event__poster">
          <Poster {...event.poster} style={event.poster.style} title={event.title} artist={event.artist} city={event.city} startsAt={event.startsAt} seed={event.id} />
        </div>

        <div className="event__main">
          {event.artist.toLowerCase() !== event.title.toLowerCase() && <p className="label event__kicker">{event.artist}</p>}
          <h1 className="event__title">{event.title}</h1>

          <dl className="facts">
            <div>
              <dt className="label">When</dt>
              <dd>
                {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
              </dd>
            </div>
            <div>
              <dt className="label">Doors</dt>
              <dd>{formatTime(event.doorsAt)}</dd>
            </div>
            <div>
              <dt className="label">Where</dt>
              <dd>
                {event.venueName}, {event.city}
              </dd>
            </div>
            <div>
              <dt className="label">Seats</dt>
              <dd className="num">{event.totalSeats.toLocaleString('en-CA')}, all reserved</dd>
            </div>
          </dl>

          <section className="sale" aria-labelledby="sale-heading">
            <h2 id="sale-heading" className="sale__headline">
              {sale.headline}
            </h2>
            {sale.countdownTo && (
              <Countdown to={sale.countdownTo} className="sale__clock" onDone={() => void queryClient.invalidateQueries({ queryKey: keys.event(event.id) })} />
            )}
            {sale.note && <p className="sale__note">{sale.note}</p>}
            {sale.cta.kind === 'link' && (
              <Link to={sale.cta.to} className="btn">
                {sale.cta.label}
              </Link>
            )}
            {sale.cta.kind === 'disabled' && (
              <button type="button" className="btn" disabled>
                {sale.cta.label}
              </button>
            )}
          </section>

          <section aria-labelledby="tiers-heading">
            <h2 id="tiers-heading" className="visually-hidden">
              Prices
            </h2>
            <ul className="tiers">
              {event.tiers.map((tier) => (
                <Tier key={tier.sectionId} tier={tier} />
              ))}
            </ul>
            <p className="event__explain">
              The price shown is the final price, fees included. Nothing is added at checkout.{' '}
              {event.waitingRoom
                ? `Everyone in the queue is let in by arrival time. Once you pick seats, you have ${HOLD_MINUTES} minutes to pay.`
                : `Once you pick seats, you have ${HOLD_MINUTES} minutes to pay.`}
            </p>
          </section>

          {event.description && <p className="event__about">{event.description}</p>}
        </div>
      </div>
    </div>
  )
}

function Tier({ tier }: { tier: TierView }) {
  const soldOut = tier.availableSeats === 0
  return (
    <li className="tier">
      <div>
        <h3 className="tier__name">{tier.name}</h3>
        <p className="label">{soldOut ? 'Sold out' : `${tier.availableSeats.toLocaleString('en-CA')} left`}</p>
      </div>
      <p className="tier__price">
        <span className="num">{formatMoney(tier.allInCents)}</span> <span className="label">with fees</span>
      </p>
    </li>
  )
}

function EventSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading event">
      <div className="event__layout">
        <div className="event__poster skeleton" />
        <div className="event__main">
          <div className="skeleton" style={{ height: 56, width: '80%' }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      </div>
    </div>
  )
}
