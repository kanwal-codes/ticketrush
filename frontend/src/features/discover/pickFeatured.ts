import type { EventSummary } from '../../api/types'

/**
 * The hero on the home page: the soonest event whose sale has not started (that is the one people are waiting
 * for), otherwise the first one on sale. The list arrives soonest first.
 */
export function pickFeatured(events: EventSummary[]): EventSummary | undefined {
  return events.find((e) => e.saleState === 'UPCOMING' || e.saleState === 'QUEUE_OPEN') ?? events.find((e) => e.saleState === 'ON_SALE')
}
