import type { EventDetail, MyTicket } from '../../api/types'
import { formatDate, formatTime } from '../../lib/time'
import { useQrImage } from './api'
import { formatCode } from './format'

/** A ticket as the design draws it: the event's own colors, a perforation, the QR code and the code as text. */
export function TicketStub({ ticket, event }: { ticket: MyTicket; event: EventDetail }) {
  const qr = useQrImage(ticket.id)
  const seat = `${ticket.section}, row ${ticket.row}, seat ${ticket.number}`
  const used = ticket.status !== 'ISSUED'

  return (
    <li className={`stub${used ? ' stub--used' : ''}`}>
      <div className="stub__main">
        <p className="label stub__label">{ticket.orderReference}</p>
        <h3 className="stub__seat">{seat}</h3>
        <p className="stub__event">{event.title}</p>
        <p className="stub__when">
          {formatDate(event.startsAt)}, {formatTime(event.startsAt)}
          <br />
          {event.venueName}, {event.city} · Doors {formatTime(event.doorsAt)}
        </p>
        {used && <p className="stub__status label">{ticket.status === 'USED' ? 'Used' : 'Cancelled'}</p>}
      </div>
      <div className="stub__side">
        {qr.url ? (
          <img className="stub__qr" src={qr.url} alt={`QR code for ${seat}`} width={168} height={168} />
        ) : qr.failed ? (
          <p className="stub__noqr">We could not load the QR code. Show the code below at the door.</p>
        ) : (
          <div className="stub__qr skeleton" role="img" aria-label="Loading the QR code" />
        )}
        <p className="stub__code num" aria-label={`Ticket code ${ticket.code.split('').join(' ')}`}>
          {formatCode(ticket.code)}
        </p>
      </div>
    </li>
  )
}
