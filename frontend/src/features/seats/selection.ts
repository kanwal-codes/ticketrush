import type { SeatMap, TierView } from '../../api/types'
import { MAX_SEATS } from '../../lib/constants'

export interface SeatInfo {
  id: number
  sectionId: number
  section: string
  row: string
  number: number
  status: string
}

/** Every seat in the map with where it is, so a selected id can be described and priced. */
export function flattenSeats(map: SeatMap): Map<number, SeatInfo> {
  const seats = new Map<number, SeatInfo>()
  for (const section of map.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        seats.set(seat.id, { id: seat.id, sectionId: section.id, section: section.name, row: row.label, number: seat.number, status: seat.status })
      }
    }
  }
  return seats
}

/** Adds the seat, or removes it if it is already chosen. Refuses a seventh seat and says so. */
export function toggleSeat(selected: number[], id: number, max: number = MAX_SEATS): { next: number[]; refused?: 'limit' } {
  if (selected.includes(id)) return { next: selected.filter((s) => s !== id) }
  if (selected.length >= max) return { next: selected, refused: 'limit' }
  return { next: [...selected, id] }
}

export interface PriceLine {
  seat: SeatInfo
  faceCents: number
  feeCents: number
}

export interface PriceSummary {
  lines: PriceLine[]
  subtotalCents: number
  feeCents: number
  totalCents: number
}

/** What the chosen seats cost, from the section prices shown on the page. The hold's own answer is the final word. */
export function summarise(selected: number[], seats: Map<number, SeatInfo>, tiers: TierView[]): PriceSummary {
  const tierBySection = new Map(tiers.map((t) => [t.sectionId, t]))
  const lines: PriceLine[] = []
  for (const id of selected) {
    const seat = seats.get(id)
    const tier = seat ? tierBySection.get(seat.sectionId) : undefined
    if (seat && tier) lines.push({ seat, faceCents: tier.faceCents, feeCents: tier.feeCents })
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.faceCents, 0)
  const feeCents = lines.reduce((sum, l) => sum + l.feeCents, 0)
  return { lines, subtotalCents, feeCents, totalCents: subtotalCents + feeCents }
}

/** "E7" from row E, seat 7. */
export const seatLabel = (s: Pick<SeatInfo, 'row' | 'number'>) => `${s.row}${s.number}`

/** "E7 and E8", "E7, E8 and E9": for a message about which seats were just taken. */
export function listSeats(labels: string[]): string {
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
