import type { CreateEventRequest, CreateVenueRequest, VenueView } from '../../api/types'

export type PosterStyle = CreateEventRequest['poster']['style']

export const POSTER_STYLES: { value: PosterStyle; label: string }[] = [
  { value: 'ORBIT', label: 'Orbit' },
  { value: 'SUN', label: 'Sun' },
  { value: 'CURTAIN', label: 'Curtain' },
  { value: 'AURORA', label: 'Aurora' },
  { value: 'PITCH', label: 'Pitch' },
  { value: 'VINYL', label: 'Vinyl' },
]

export const MAX_VENUE_SEATS = 5000

export interface SectionDraft {
  name: string
  rows: string
  seatsPerRow: string
}

/** Everything the form holds, as the text the organizer typed. Dates are the browser's local "datetime-local" strings. */
export interface Draft {
  venueMode: 'existing' | 'new'
  venueId: string
  venueName: string
  venueCity: string
  sections: SectionDraft[]
  title: string
  artist: string
  description: string
  dropOpensAt: string
  onSaleAt: string
  doorsAt: string
  startsAt: string
  waitingRoom: boolean
  /** Dollars per ticket, keyed by section name (names are unique within a venue). */
  prices: Record<string, string>
  posterStyle: PosterStyle
  inkOne: string
  inkTwo: string
  paperColor: string
}

export type Errors = Record<string, string>

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-08T20:00" in the browser's own time zone, the format a datetime-local input takes and gives. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const atHour = (from: Date, days: number, hour: number) => {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** A starting point that already passes every rule: a show in a month, doors an hour before, sale a week out. */
export function emptyDraft(now: Date = new Date()): Draft {
  const starts = atHour(now, 30, 20)
  const onSale = atHour(now, 7, 10)
  return {
    venueMode: 'existing',
    venueId: '',
    venueName: '',
    venueCity: '',
    sections: [{ name: 'Floor', rows: '10', seatsPerRow: '20' }],
    title: '',
    artist: '',
    description: '',
    dropOpensAt: toLocalInput(new Date(onSale.getTime() - 30 * 60_000)),
    onSaleAt: toLocalInput(onSale),
    doorsAt: toLocalInput(new Date(starts.getTime() - 60 * 60_000)),
    startsAt: toLocalInput(starts),
    waitingRoom: false,
    prices: {},
    posterStyle: 'ORBIT',
    inkOne: '#2b2fd9',
    inkTwo: '#ff5a36',
    paperColor: '#ffd9c4',
  }
}

const num = (text: string) => (text.trim() === '' ? NaN : Number(text))
const at = (local: string) => new Date(local).getTime()

export interface Tier {
  name: string
  seats: number
}

/** The sections being priced: the chosen venue's, or the ones being laid out. */
export function tiersOf(draft: Draft, venues: VenueView[]): Tier[] {
  if (draft.venueMode === 'existing') {
    return venues.find((v) => String(v.id) === draft.venueId)?.sections.map((s) => ({ name: s.name, seats: s.seats })) ?? []
  }
  return draft.sections.map((s) => ({ name: s.name.trim(), seats: (num(s.rows) || 0) * (num(s.seatsPerRow) || 0) }))
}

export const totalSeats = (tiers: Tier[]) => tiers.reduce((sum, t) => sum + (Number.isFinite(t.seats) ? t.seats : 0), 0)

/** Dollars typed by a person to whole cents, or NaN. "96", "96.5" and "96.50" are fine; "9.999" is not. */
export function dollarsToCents(text: string): number {
  const t = text.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN
  return Math.round(Number(t) * 100)
}

/**
 * What is wrong with the draft before asking the server, using the server's rules and (where it has them) its words.
 * Keys are field names; the venue layout problems are under "sections" and per-tier prices under "price:<name>".
 */
export function validateDraft(draft: Draft, venues: VenueView[], now: Date = new Date()): Errors {
  const e: Errors = {}
  if (!draft.title.trim()) e.title = 'Give the event a title'
  else if (draft.title.trim().length > 160) e.title = 'Use at most 160 characters'
  if (!draft.artist.trim()) e.artist = 'Say who is playing'
  else if (draft.artist.trim().length > 120) e.artist = 'Use at most 120 characters'
  if (draft.description.length > 4000) e.description = 'Use at most 4000 characters'

  if (draft.venueMode === 'existing') {
    if (!draft.venueId) e.venueId = 'Choose a venue, or lay out a new one'
  } else {
    if (!draft.venueName.trim()) e.venueName = 'Name the venue'
    if (!draft.venueCity.trim()) e.venueCity = 'Say which city it is in'
    const names = new Set<string>()
    for (const s of draft.sections) {
      const name = s.name.trim()
      const rows = num(s.rows)
      const per = num(s.seatsPerRow)
      if (!name) e.sections = 'Every section needs a name'
      else if (names.has(name.toLowerCase())) e.sections = `Section names must be unique, but '${name}' repeats`
      names.add(name.toLowerCase())
      if (!(Number.isInteger(rows) && rows >= 1 && rows <= 200) || !(Number.isInteger(per) && per >= 1 && per <= 200))
        e.sections ??= 'Rows and seats per row must be whole numbers from 1 to 200'
    }
    const total = totalSeats(tiersOf(draft, venues))
    if (!e.sections && total > MAX_VENUE_SEATS) e.sections = `A venue can have at most ${MAX_VENUE_SEATS} seats, and this layout has ${total}`
  }

  const tiers = tiersOf(draft, venues)
  for (const t of tiers) {
    const cents = dollarsToCents(draft.prices[t.name] ?? '')
    if (!Number.isFinite(cents) || cents < 1 || cents > 5_000_000) e[`price:${t.name}`] = 'Enter a price in dollars, like 96 or 96.50'
  }

  const drop = at(draft.dropOpensAt)
  const onSale = at(draft.onSaleAt)
  const doors = at(draft.doorsAt)
  const starts = at(draft.startsAt)
  if ([drop, onSale, doors, starts].some(Number.isNaN)) {
    for (const k of ['dropOpensAt', 'onSaleAt', 'doorsAt', 'startsAt'] as const) if (Number.isNaN(at(draft[k]))) e[k] = 'Choose a date and time'
  } else {
    if (drop > onSale) e.dropOpensAt = 'The waiting room cannot open after tickets go on sale'
    if (onSale >= starts) e.onSaleAt = 'Tickets must go on sale before the event starts'
    if (doors > starts) e.doorsAt = 'Doors cannot open after the event starts'
    if (starts <= now.getTime()) e.startsAt = 'The event must start in the future'
  }
  return e
}

export function venueRequest(draft: Draft): CreateVenueRequest {
  return {
    name: draft.venueName.trim(),
    city: draft.venueCity.trim(),
    sections: draft.sections.map((s) => ({ name: s.name.trim(), rows: Number(s.rows), seatsPerRow: Number(s.seatsPerRow) })),
  }
}

/** The event request, once the venue exists. Prices are matched to the venue's sections by name. */
export function eventRequest(draft: Draft, venue: VenueView): CreateEventRequest {
  return {
    title: draft.title.trim(),
    artist: draft.artist.trim(),
    description: draft.description.trim(),
    venueId: venue.id,
    startsAt: new Date(draft.startsAt).toISOString(),
    doorsAt: new Date(draft.doorsAt).toISOString(),
    dropOpensAt: new Date(draft.dropOpensAt).toISOString(),
    onSaleAt: new Date(draft.onSaleAt).toISOString(),
    poster: { style: draft.posterStyle, inkOne: draft.inkOne, inkTwo: draft.inkTwo, paperColor: draft.paperColor },
    prices: venue.sections.map((s) => ({ sectionId: s.id, priceCents: dollarsToCents(draft.prices[s.name] ?? '') })),
    waitingRoom: draft.waitingRoom,
  }
}

const KEY = 'tr.console.draft'

/** The draft survives a refresh, and a sign-in when the 30 minute token runs out in the middle of typing. */
export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? ({ ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) } as Draft) : null
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage can be full or blocked; the form still works, it just cannot be recovered.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
