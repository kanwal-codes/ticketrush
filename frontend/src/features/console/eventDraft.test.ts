import { beforeEach, describe, expect, it } from 'vitest'
import type { VenueView } from '../../api/types'
import {
  clearDraft,
  dollarsToCents,
  emptyDraft,
  eventRequest,
  loadDraft,
  saveDraft,
  tiersOf,
  totalSeats,
  validateDraft,
  venueRequest,
  type Draft,
} from './eventDraft'

const NOW = new Date('2026-10-08T12:00:00')
const venue: VenueView = { id: 5, name: 'Halden Hall', city: 'Montreal', totalSeats: 300, sections: [{ id: 11, name: 'Floor', seats: 100 }, { id: 12, name: 'Balcony', seats: 200 }] }

const filled = (patch: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(NOW),
  title: 'Afterlight Tour',
  artist: 'Mira Okafor',
  venueId: '5',
  prices: { Floor: '96', Balcony: '64.50' },
  ...patch,
})

describe('dollarsToCents', () => {
  it('reads whole dollars and cents, and nothing sloppier', () => {
    expect(dollarsToCents('96')).toBe(9600)
    expect(dollarsToCents('96.5')).toBe(9650)
    expect(dollarsToCents(' 64.50 ')).toBe(6450)
    for (const bad of ['', 'abc', '9.999', '-5', '1e3', '$96']) expect(dollarsToCents(bad)).toBeNaN()
  })
})

describe('validateDraft', () => {
  it('passes a complete draft, and the defaults already satisfy the date rules', () => {
    expect(validateDraft(filled(), [venue], NOW)).toEqual({})
  })

  it('asks for what is missing, in words', () => {
    const e = validateDraft(filled({ title: ' ', artist: '', venueId: '', prices: {} }), [venue], NOW)
    expect(e).toMatchObject({ title: 'Give the event a title', artist: 'Say who is playing', venueId: expect.stringContaining('Choose a venue') })
  })

  it('applies the server\'s date rules with its words', () => {
    const e = validateDraft(
      filled({ dropOpensAt: '2026-10-20T10:00', onSaleAt: '2026-10-15T10:00', startsAt: '2026-10-10T20:00', doorsAt: '2026-10-10T22:00' }),
      [venue],
      NOW,
    )
    expect(e.dropOpensAt).toBe('The waiting room cannot open after tickets go on sale')
    expect(e.onSaleAt).toBe('Tickets must go on sale before the event starts')
    expect(e.doorsAt).toBe('Doors cannot open after the event starts')
    expect(validateDraft(filled({ startsAt: '2026-10-01T20:00', onSaleAt: '2026-09-20T10:00', dropOpensAt: '2026-09-20T09:00', doorsAt: '2026-10-01T19:00' }), [venue], NOW).startsAt).toBe('The event must start in the future')
  })

  it('requires a valid price for every section', () => {
    const e = validateDraft(filled({ prices: { Floor: '0', Balcony: '12.345' } }), [venue], NOW)
    expect(Object.keys(e).sort()).toEqual(['price:Balcony', 'price:Floor'])
  })

  it('checks a new venue layout: names, sizes and the 5000 seat cap', () => {
    const base = { venueMode: 'new' as const, venueName: 'Hall', venueCity: 'Montreal', prices: { Floor: '10' } }
    expect(validateDraft(filled({ ...base, sections: [{ name: 'Floor', rows: '10', seatsPerRow: '20' }] }), [], NOW)).toEqual({})
    expect(validateDraft(filled({ ...base, sections: [{ name: '', rows: '10', seatsPerRow: '20' }] }), [], NOW).sections).toBe('Every section needs a name')
    expect(validateDraft(filled({ ...base, sections: [{ name: 'A', rows: '1', seatsPerRow: '1' }, { name: 'a', rows: '1', seatsPerRow: '1' }] }), [], NOW).sections).toContain('must be unique')
    expect(validateDraft(filled({ ...base, sections: [{ name: 'Floor', rows: '0', seatsPerRow: '20' }] }), [], NOW).sections).toContain('whole numbers')
    expect(validateDraft(filled({ ...base, sections: [{ name: 'Floor', rows: '100', seatsPerRow: '60' }] }), [], NOW).sections).toBe('A venue can have at most 5000 seats, and this layout has 6000')
    expect(validateDraft(filled({ ...base, venueName: '', venueCity: ' ' }), [], NOW)).toMatchObject({ venueName: 'Name the venue', venueCity: 'Say which city it is in' })
  })
})

describe('tiers', () => {
  it('come from the chosen venue, or from the layout being typed', () => {
    expect(tiersOf(filled(), [venue])).toEqual([{ name: 'Floor', seats: 100 }, { name: 'Balcony', seats: 200 }])
    expect(tiersOf(filled({ venueId: '' }), [venue])).toEqual([])
    const typed = tiersOf(filled({ venueMode: 'new', sections: [{ name: ' Floor ', rows: '4', seatsPerRow: '5' }] }), [])
    expect(typed).toEqual([{ name: 'Floor', seats: 20 }])
    expect(totalSeats(typed)).toBe(20)
  })
})

describe('requests', () => {
  it('turns the draft into the API\'s shape, matching prices to sections by name', () => {
    const req = eventRequest(filled({ waitingRoom: true, title: '  Afterlight Tour ' }), venue)
    expect(req).toMatchObject({
      title: 'Afterlight Tour',
      venueId: 5,
      waitingRoom: true,
      poster: { style: 'ORBIT', inkOne: '#2b2fd9' },
      prices: [{ sectionId: 11, priceCents: 9600 }, { sectionId: 12, priceCents: 6450 }],
    })
    expect(req.startsAt).toMatch(/Z$/)
    expect(venueRequest(filled({ venueName: ' Hall ', venueCity: 'Laval', sections: [{ name: ' Floor ', rows: '4', seatsPerRow: '5' }] }))).toEqual({
      name: 'Hall',
      city: 'Laval',
      sections: [{ name: 'Floor', rows: 4, seatsPerRow: 5 }],
    })
  })
})

describe('draft storage', () => {
  beforeEach(() => sessionStorage.clear())

  it('round-trips, tolerates fields added later, and clears', () => {
    expect(loadDraft()).toBeNull()
    saveDraft(filled({ title: 'Kept' }))
    expect(loadDraft()?.title).toBe('Kept')
    sessionStorage.setItem('tr.console.draft', JSON.stringify({ title: 'Old shape' }))
    expect(loadDraft()).toMatchObject({ title: 'Old shape', posterStyle: 'ORBIT' })
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('treats a corrupt draft as no draft', () => {
    sessionStorage.setItem('tr.console.draft', '{nope')
    expect(loadDraft()).toBeNull()
  })
})
