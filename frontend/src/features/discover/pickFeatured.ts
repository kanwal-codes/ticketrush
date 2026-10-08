import type { EventSummary } from '../../api/types'

/**
 * The hero on the home page: the event whose sale opens soonest (that is the one people are waiting for),
 * otherwise the first one on sale. The list arrives ordered by when the events happen, which is not the same
 * thing, so the sale time is compared here.
 */
export function pickFeatured(events: EventSummary[]): EventSummary | undefined {
  const waiting = events.filter((e) => e.saleState === 'UPCOMING' || e.saleState === 'QUEUE_OPEN')
  const soonest = waiting.sort((a, b) => Date.parse(a.onSaleAt) - Date.parse(b.onSaleAt))[0]
  return soonest ?? events.find((e) => e.saleState === 'ON_SALE')
}
