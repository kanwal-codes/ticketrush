/**
 * Talks to the backend directly, the way an organizer's tools and the load tests do, to set up what a test needs
 * (events, guests) and to check afterwards what really happened (seats, charges, scans).
 */
const API = process.env.BACKEND_URL ?? 'http://localhost:8080'

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

let organizer: Promise<string> | undefined

export function organizerToken(): Promise<string> {
  const password = process.env.ORGANIZER_PASSWORD ?? process.env.DEMO_ORGANIZER_PASSWORD
  if (!password) throw new Error('Set ORGANIZER_PASSWORD (the demo organizer password) to run the end-to-end tests')
  organizer ??= call<{ accessToken: string }>('POST', '/api/auth/login', { email: process.env.ORGANIZER_EMAIL ?? 'organizer@ticketrush.dev', password }).then((r) => r.accessToken)
  return organizer
}

export interface NewEvent {
  title?: string
  artist?: string
  waitingRoom?: boolean
  /** Seconds until the sale opens. Negative or zero means it is already on sale. */
  onSaleInSeconds?: number
  rows?: number
  perRow?: number
  poster?: { style: string; inkOne: string; inkTwo: string; paperColor: string }
}

export interface CreatedEvent {
  id: number
  title: string
  /** Seat ids in reading order, so a test can say "the first two seats". */
  seatIds: number[]
}

/** A published event at its own venue: one section "Stalls" at $96 a seat. */
export async function createEvent(options: NewEvent = {}): Promise<CreatedEvent> {
  const token = await organizerToken()
  const { rows = 4, perRow = 10, onSaleInSeconds = -30, waitingRoom = true } = options
  const title = options.title ?? `E2E Night ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const venue = await call<{ id: number; sections: { id: number }[] }>('POST', '/api/venues', { name: 'E2E Hall', city: 'Montreal', sections: [{ name: 'Stalls', rows, seatsPerRow: perRow }] }, token)
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const day = 86_400_000
  const event = await call<{ id: number }>(
    'POST',
    '/api/events',
    {
      title,
      artist: options.artist ?? 'The E2E Band',
      description: 'Created by an end-to-end test.',
      venueId: venue.id,
      startsAt: iso(now + 30 * day),
      doorsAt: iso(now + 30 * day - 3_600_000),
      dropOpensAt: iso(now - 60_000),
      onSaleAt: iso(now + onSaleInSeconds * 1000),
      poster: options.poster ?? { style: 'ORBIT', inkOne: '#2B2FD9', inkTwo: '#FF5A36', paperColor: '#FFD9C4' },
      prices: [{ sectionId: venue.sections[0]!.id, priceCents: 9600 }],
      waitingRoom,
    },
    token,
  )
  await call('POST', `/api/events/${event.id}/publish`, undefined, token)
  const map = await call<{ sections: { rows: { seats: { id: number }[] }[] }[] }>('GET', `/api/events/${event.id}/seats`)
  const seatIds = map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((seat) => seat.id)))
  return { id: event.id, title, seatIds }
}

/** A guest with a ready token, made without password hashing (needs the loadtest profile). */
export async function createGuest(): Promise<{ id: number; token: string }> {
  const [guest] = await call<{ id: number; token: string }[]>('POST', '/dev/load/guests?count=1', undefined, await organizerToken())
  return guest!
}

export async function scanTicket(code: string, eventId: number): Promise<{ outcome: string; seat: string | null }> {
  return call('POST', '/api/tickets/scan', { code, eventId }, await organizerToken())
}

export async function seatStatuses(eventId: number): Promise<Record<string, number>> {
  const map = await call<{ sections: { rows: { seats: { status: string }[] }[] }[] }>('GET', `/api/events/${eventId}/seats`)
  const counts: Record<string, number> = {}
  for (const seat of map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats))) counts[seat.status] = (counts[seat.status] ?? 0) + 1
  return counts
}

export async function providerCharges(): Promise<{ charges: number; chargedKeys: string[] }> {
  return call('GET', '/dev/load/payments', undefined, await organizerToken())
}
