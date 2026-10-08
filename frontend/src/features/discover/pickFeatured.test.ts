import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../../api/types'
import { pickFeatured } from './pickFeatured'

const make = (id: number, saleState: EventSummary['saleState']): EventSummary => ({
  id,
  title: `Event ${id}`,
  artist: 'Someone',
  startsAt: '2026-11-14T20:00:00Z',
  venueName: 'Hall',
  city: 'Montreal',
  dropOpensAt: '2026-10-08T13:50:00Z',
  onSaleAt: '2026-10-08T14:00:00Z',
  saleState,
  fromAllInCents: 5000,
  poster: { style: 'ORBIT', inkOne: '#000000', inkTwo: '#111111', paperColor: '#ffffff' },
})

describe('pickFeatured', () => {
  it('prefers an event whose sale has not started', () => {
    expect(pickFeatured([make(1, 'ON_SALE'), make(2, 'UPCOMING')])?.id).toBe(2)
  })

  it('picks the sale that opens soonest, not the event that happens first', () => {
    const later = { ...make(2, 'UPCOMING'), onSaleAt: '2026-10-12T14:00:00Z' }
    const sooner = { ...make(3, 'QUEUE_OPEN'), onSaleAt: '2026-10-09T14:00:00Z' }
    // Event 2 is listed first (it happens first) but its sale opens later.
    expect(pickFeatured([later, sooner])?.id).toBe(3)
  })

  it('falls back to the first event on sale', () => {
    expect(pickFeatured([make(1, 'ENDED'), make(2, 'ON_SALE')])?.id).toBe(2)
  })

  it('has nothing to feature in an empty or finished list', () => {
    expect(pickFeatured([])).toBeUndefined()
    expect(pickFeatured([make(1, 'ENDED')])).toBeUndefined()
  })
})
