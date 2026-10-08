import { describe, expect, it } from 'vitest'
import type { EventDetail } from '../../api/types'
import { saleView } from './saleView'

const event: EventDetail = {
  id: 7,
  title: 'Afterlight Tour',
  artist: 'Mira Okafor',
  description: '',
  startsAt: '2026-11-14T20:00:00Z',
  doorsAt: '2026-11-14T19:00:00Z',
  dropOpensAt: '2026-10-08T13:50:00Z',
  onSaleAt: '2026-10-08T14:00:00Z',
  saleState: 'ON_SALE',
  serverTime: '2026-10-08T12:00:00Z',
  venueName: 'Halden Hall',
  city: 'Montreal',
  poster: { style: 'ORBIT', inkOne: '#2b2fd9', inkTwo: '#ff5a36', paperColor: '#ffd9c4' },
  tiers: [],
  totalSeats: 2000,
  availableSeats: 1500,
  waitingRoom: true,
}

describe('saleView', () => {
  it('counts down and disables the button before the waiting room opens', () => {
    const view = saleView({ ...event, saleState: 'UPCOMING' })
    expect(view.headline).toBe('Tickets go on sale in')
    expect(view.countdownTo).toBe(event.onSaleAt)
    expect(view.cta.kind).toBe('disabled')
  })

  it('says plainly there is no waiting room when there is not one', () => {
    const view = saleView({ ...event, saleState: 'UPCOMING', waitingRoom: false })
    expect(view.cta).toEqual({ kind: 'disabled', label: 'Not on sale yet' })
    expect(view.note).toBeUndefined()
  })

  it('opens the queue while the sale is still counting down', () => {
    const view = saleView({ ...event, saleState: 'QUEUE_OPEN' })
    expect(view.countdownTo).toBe(event.onSaleAt)
    expect(view.cta).toEqual({ kind: 'link', label: 'Join the waiting room', to: '/events/7/queue' })
  })

  it('sends guests to the waiting room when the sale is open and there is one', () => {
    expect(saleView(event).cta).toEqual({ kind: 'link', label: 'Join the waiting room', to: '/events/7/queue' })
  })

  it('goes straight to the seats when there is no waiting room', () => {
    expect(saleView({ ...event, waitingRoom: false }).cta).toEqual({ kind: 'link', label: 'Choose seats', to: '/events/7/seats' })
  })

  it('offers nothing when sold out or over', () => {
    expect(saleView({ ...event, availableSeats: 0 })).toMatchObject({ headline: 'Sold out', cta: { kind: 'none' } })
    expect(saleView({ ...event, saleState: 'ENDED' })).toMatchObject({ headline: 'This event has started', cta: { kind: 'none' } })
  })
})
