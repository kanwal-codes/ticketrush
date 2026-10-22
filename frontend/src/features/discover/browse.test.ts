import { describe, expect, it } from 'vitest'
import type { EventSummary } from '../../api/types'
import { eventDetail } from '../../test/fixtures'
import { browseEvents, categoryOf, type BrowseFilters } from './browse'

const make = (title: string, overrides: Partial<EventSummary> = {}): EventSummary => ({ ...eventDetail(), title, fromAllInCents: 1000, ...overrides })
const filters: BrowseFilters = { q: '', category: 'All events', city: '', when: '', sort: '' }

describe('event browsing', () => {
  it('recognizes explicit event types and leaves unknown names unclassified', () => {
    expect(categoryOf(make('Stand-up Cellar: Priya Nair'))).toBe('Comedy')
    expect(categoryOf(make('Summer Jazz Festival'))).toBe('Festivals')
    expect(categoryOf(make('Lions vs Harbour FC'))).toBe('Sports')
    expect(categoryOf(make('Northern Lights Orchestra'))).toBe('Concerts')
    expect(categoryOf(make('Contemporary Ballet'))).toBe('Theatre & arts')
    expect(categoryOf(make('Untitled'))).toBe('Other')
  })
  it('combines city and category filters with venue search', () => {
    const events = [make('Jazz Live', { id: 1, city: 'Toronto', venueName: 'Harbour Hall' }), make('Jazz Live', { id: 2, city: 'Montreal', venueName: 'Harbour Hall' }), make('Comedy Live', { id: 3, city: 'Toronto', venueName: 'Harbour Hall' })]
    expect(browseEvents(events, { ...filters, q: 'harbour', city: 'Toronto', category: 'Concerts' }).map(event => event.id)).toEqual([1])
  })
  it('sorts prices without changing the catalog order', () => {
    const events = [make('B', { id: 1, fromAllInCents: 3000 }), make('A', { id: 2, fromAllInCents: 1000 })]
    expect(browseEvents(events, { ...filters, sort: 'price-low' }).map(event => event.id)).toEqual([2, 1])
    expect(events.map(event => event.id)).toEqual([1, 2])
  })
  it('uses local calendar boundaries for weekends, including Sunday', () => {
    const events = [make('Saturday', { id: 1, startsAt: new Date(2026, 9, 24, 20).toISOString() }), make('Sunday', { id: 2, startsAt: new Date(2026, 9, 25, 20).toISOString() }), make('Monday', { id: 3, startsAt: new Date(2026, 9, 26, 20).toISOString() })]
    expect(browseEvents(events, { ...filters, when: 'weekend' }, new Date(2026, 9, 20)).map(event => event.id)).toEqual([1, 2])
    expect(browseEvents(events, { ...filters, when: 'weekend' }, new Date(2026, 9, 25)).map(event => event.id)).toEqual([2])
  })
})
