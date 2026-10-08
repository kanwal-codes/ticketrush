import type { EventDetail, QueueView } from '../api/types'

export function eventDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 7,
    title: 'Afterlight Tour',
    artist: 'Mira Okafor',
    description: 'Two hours of new songs.',
    startsAt: '2026-11-14T20:00:00Z',
    doorsAt: '2026-11-14T19:00:00Z',
    dropOpensAt: '2026-10-09T13:50:00Z',
    onSaleAt: '2026-10-09T14:00:00Z',
    saleState: 'ON_SALE',
    serverTime: '2026-10-09T14:05:00Z',
    venueName: 'Halden Hall',
    city: 'Montreal',
    poster: { style: 'ORBIT', inkOne: '#2b2fd9', inkTwo: '#ff5a36', paperColor: '#ffd9c4' },
    tiers: [{ sectionId: 1, name: 'Floor', faceCents: 12800, feeCents: 960, allInCents: 13760, totalSeats: 500, availableSeats: 120 }],
    totalSeats: 2000,
    availableSeats: 1500,
    waitingRoom: true,
    ...overrides,
  }
}

export function queueView(overrides: Partial<QueueView> = {}): QueueView {
  return {
    state: 'WAITING',
    position: 313,
    aheadOfYou: 312,
    queueLength: 1500,
    estimatedWaitSeconds: 240,
    admissionToken: null,
    admittedUntil: null,
    saleState: 'ON_SALE',
    serverTime: '2026-10-09T14:05:00Z',
    ...overrides,
  }
}
