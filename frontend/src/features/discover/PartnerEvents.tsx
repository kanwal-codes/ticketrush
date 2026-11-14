import { usePartnerEvents } from '../../api/queries'
import { formatDateShort } from '../../lib/time'

/** Events sold by Ticketmaster. They link out: TicketRush does not sell these. Hidden when there is nothing to show. */
export function PartnerEvents({ q, city }: { q: string; city: string }) {
  const { data } = usePartnerEvents(q, city)
  if (!data?.length) return null
  return (
    <section className="partner" aria-labelledby="partner-heading">
      <div className="discover__head"><div><h2 id="partner-heading">Also on Ticketmaster.</h2><p className="browse__count">Tickets for these are sold on Ticketmaster.</p></div></div>
      <ul className="grid">
        {data.map(event => (
          <li key={event.id} className="card">
            <a className="card__link" href={event.url} aria-label={`${event.title}, ${formatDateShort(event.startsAt)}. Tickets on Ticketmaster, opens in a new tab`} target="_blank" rel="noopener noreferrer">
              <div className="card__poster partner__image">{event.imageUrl && <img src={event.imageUrl} alt="" loading="lazy" />}</div>
              <div className="card__body">
                <p className="card__category">{event.category}</p>
                <h3 className="card__title">{event.title}</h3>
                <time className="card__date" dateTime={event.startsAt}>{formatDateShort(event.startsAt)}</time>
                <p className="card__venue">{[event.venueName, event.city].filter(Boolean).join(', ')}</p>
                <p className="partner__out">Tickets on Ticketmaster <span aria-hidden="true">↗</span></p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
