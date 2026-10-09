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
    tiers: [{ sectionId: 1, name: 'Floor', faceCents: 9600, feeCents: 720, allInCents: 10320, totalSeats: 500, availableSeats: 120 }],
    totalSeats: 2000,
    availableSeats: 1500,
    waitingRoom: true,
    cancelled: false,
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

import type { HoldView, SeatMap } from '../api/types'

/** One section of rows A, B, ... with seat ids counting up from `startId`, so row A is 100..(100+perRow-1). */
export function seatMapOf(opts: { rows?: number; perRow?: number; taken?: number[]; held?: number[]; name?: string; sectionId?: number } = {}): SeatMap {
  const { rows = 2, perRow = 5, taken = [], held = [], name = 'Floor', sectionId = 1 } = opts
  return {
    sections: [
      {
        id: sectionId,
        name,
        rows: Array.from({ length: rows }, (_, r) => ({
          label: String.fromCharCode(65 + r),
          seats: Array.from({ length: perRow }, (_, c) => {
            const id = 100 + r * perRow + c
            return { id, number: c + 1, status: taken.includes(id) ? 'SOLD' : held.includes(id) ? 'HELD' : 'AVAILABLE' }
          }),
        })),
      },
    ],
  }
}

export function holdView(overrides: Partial<HoldView> = {}): HoldView {
  return {
    id: 55,
    eventId: 7,
    expiresAt: '2026-10-09T14:15:00Z',
    serverTime: '2026-10-09T14:05:00Z',
    seats: [
      { seatId: 100, section: 'Floor', row: 'A', number: 1, faceCents: 9600 },
      { seatId: 101, section: 'Floor', row: 'A', number: 2, faceCents: 9600 },
    ],
    subtotalCents: 19200,
    feeCents: 1440,
    totalCents: 20640,
    ...overrides,
  }
}

export const organizer = { id: 1, email: 'boss@ticketrush.test', displayName: 'Demo Organizer', role: 'ORGANIZER' }
export const guestMe = { id: 2, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST' }

export function summary(overrides: Partial<import('../api/types').SalesSummary> = {}): import('../api/types').SalesSummary {
  return {
    eventId: 7,
    title: 'Afterlight Tour',
    status: 'PUBLISHED',
    tiers: [
      { sectionId: 1, name: 'Floor', priceCents: 9600, total: 100, sold: 40, held: 10, available: 50 },
      { sectionId: 2, name: 'Balcony', priceCents: 6400, total: 50, sold: 0, held: 0, available: 50 },
    ],
    revenue: { paidOrders: 20, subtotalCents: 384000, feeCents: 28800, totalCents: 412800 },
    ordersByStatus: { PAID: 20, FAILED: 1 },
    door: { issued: 40, checkedIn: 12 },
    ...overrides,
  }
}
