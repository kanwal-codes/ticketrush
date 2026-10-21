import type { EventSummary } from '../../api/types'

export const categories = ['All events', 'Concerts', 'Comedy', 'Festivals', 'Theatre & arts', 'Sports', 'Other'] as const
export type Category = typeof categories[number]
export type BrowseFilters = { q: string; category: string; city: string; when: string; sort: string }

// shortcut: legacy events have no category field; replace name matching with organizer metadata when the API adds it.
export function categoryOf(event: EventSummary): Category {
  const name = `${event.title} ${event.artist}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(festival|fest)\b/.test(name)) return 'Festivals'
  if (/\b(stand[ -]?up|comedy|comedian|humour)\b/.test(name)) return 'Comedy'
  if (/\b(vs\.?|football|soccer|hockey|basketball|rugby|tennis)\b/.test(name)) return 'Sports'
  if (/\b(theatre|theater|ballet|dance|exhibition|opera|musical)\b/.test(name)) return 'Theatre & arts'
  if (/\b(concert|orchestra|orchestre|jazz|tour|sessions|live|brass|fanfare|vivaldi|after hours|tidal night)\b/.test(name)) return 'Concerts'
  return 'Other'
}

export function browseEvents(events: EventSummary[], filters: BrowseFilters, now = new Date()): EventSummary[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let end: Date | undefined
  if (filters.when === 'week') end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  if (filters.when === 'weekend') {
    const day = start.getDay()
    start.setDate(start.getDate() + (day === 0 ? 0 : (6 - day + 7) % 7))
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (day === 0 ? 1 : 2))
  }
  const query = filters.q.trim().toLocaleLowerCase()
  return events.filter(event => {
    const date = new Date(event.startsAt)
    return (!query || `${event.title} ${event.artist} ${event.venueName} ${event.city}`.toLocaleLowerCase().includes(query))
      && (filters.category === 'All events' || categoryOf(event) === filters.category)
      && (!filters.city || event.city === filters.city)
      && (!end || (date >= start && date < end))
  }).sort((a, b) => {
    if (filters.sort === 'price-low') return a.fromAllInCents - b.fromAllInCents || a.id - b.id
    if (filters.sort === 'price-high') return b.fromAllInCents - a.fromAllInCents || a.id - b.id
    if (filters.sort === 'name') return a.title.localeCompare(b.title) || a.id - b.id
    return Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id - b.id
  })
}
