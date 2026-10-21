import type { EventDetail, MyTicket } from '../../api/types'
import { formatDate, formatTime } from '../../lib/time'
import { useQrImage } from './api'
import { formatCode } from './format'
import { Poster } from '../../components/Poster'

/** A ticket as the design draws it: the event's own colors, a perforation, the QR code and the code as text. */
export function TicketStub({ ticket, event, index = 0 }: { ticket: MyTicket; event: EventDetail; index?: number }) {
  const cancelled = ticket.status === 'VOID'
  // A cancelled ticket does not work at the door, so it shows no code to scan and fetches none.
  const qr = useQrImage(ticket.id, !cancelled)
  const seat = `${ticket.section}, row ${ticket.row}, seat ${ticket.number}`
  const used = ticket.status !== 'ISSUED'

  return (
    <li className={`stub${used ? ' stub--used' : ''}`} style={{ '--i': index } as React.CSSProperties}>
      <div className="stub__art"><Poster {...event.poster} style={event.poster.style} title={event.title} artist={event.artist} city={event.city} startsAt={event.startsAt} seed={event.id} /></div>
      <div className="stub__main">
        <p className="label stub__label">Admission / Order <span translate="no">{ticket.orderReference}</span></p>
        <h2 className="stub__title">{event.title}</h2>
        <p className="stub__when">
          {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
          <br />
          {event.venueName}, {event.city} · Doors {formatTime(event.doorsAt)}
        </p>
        <h3 className="stub__seat">{seat}</h3>
        {used && <p className="stub__status label">{ticket.status === 'USED' ? 'Used' : 'Cancelled'}</p>}
      </div>
      <div className="stub__side">
        {cancelled ? (
          <p className="stub__noqr">This ticket was cancelled and no longer works at the door.</p>
        ) : qr.url ? (
          <img className="stub__qr" src={qr.url} alt={`QR code for ${seat}`} width={168} height={168} />
        ) : qr.failed ? (
          <p className="stub__noqr">We could not load the QR code. Show the code below at the door.</p>
        ) : (
          <div className="stub__qr skeleton" role="img" aria-label="Loading the QR code" />
        )}
        {!cancelled && (
          <p className="stub__code num" translate="no" aria-label={`Ticket code ${ticket.code.split('').join(' ')}`}>
            {formatCode(ticket.code)}
          </p>
        )}
      </div>
    </li>
  )
}
