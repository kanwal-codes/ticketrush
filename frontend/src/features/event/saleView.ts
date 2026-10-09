import type { EventDetail } from '../../api/types'
import { formatTime } from '../../lib/time'

export type Cta =
  | { kind: 'link'; label: string; to: string }
  | { kind: 'disabled'; label: string }
  | { kind: 'none' }

export interface SaleView {
  headline: string
  /** Show a countdown to this moment, when there is one. */
  countdownTo?: string
  note?: string
  cta: Cta
}

/** What the sale panel says and offers, for each state an event can be in. */
export function saleView(event: EventDetail): SaleView {
  if (event.cancelled) {
    return { headline: 'This event was cancelled', note: 'Tickets are no longer on sale. Anyone who bought tickets is refunded automatically.', cta: { kind: 'none' } }
  }
  const queue: Cta = { kind: 'link', label: 'Join the waiting room', to: `/events/${event.id}/queue` }
  switch (event.saleState) {
    case 'UPCOMING':
      return {
        headline: 'Tickets go on sale in',
        countdownTo: event.onSaleAt,
        // The button already says when it opens; this says what it is for.
        note: event.waitingRoom ? 'Once it opens, people are let in by arrival time, not by who clicks fastest.' : undefined,
        cta: { kind: 'disabled', label: event.waitingRoom ? `Waiting room opens at ${formatTime(event.dropOpensAt)}` : 'Not on sale yet' },
      }
    case 'QUEUE_OPEN':
      return {
        headline: 'Tickets go on sale in',
        countdownTo: event.onSaleAt,
        note: 'The waiting room is open. Joining now keeps your place in line.',
        cta: queue,
      }
    case 'ON_SALE':
      if (event.availableSeats === 0) return { headline: 'Sold out', cta: { kind: 'none' } }
      return {
        headline: 'On sale now',
        cta: event.waitingRoom ? queue : { kind: 'link', label: 'Choose seats', to: `/events/${event.id}/seats` },
      }
    case 'ENDED':
      return { headline: 'This event has started', cta: { kind: 'none' } }
  }
}
