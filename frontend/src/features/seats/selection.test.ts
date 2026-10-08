import { describe, expect, it } from 'vitest'
import type { SeatMap, TierView } from '../../api/types'
import { flattenSeats, listSeats, seatLabel, summarise, toggleSeat } from './selection'

const map: SeatMap = {
  sections: [
    {
      id: 1,
      name: 'Stalls',
      rows: [
        { label: 'E', seats: [{ id: 17, number: 7, status: 'AVAILABLE' }, { id: 18, number: 8, status: 'AVAILABLE' }] },
      ],
    },
    { id: 2, name: 'Balcony', rows: [{ label: 'A', seats: [{ id: 30, number: 1, status: 'SOLD' }] }] },
  ],
}

const tiers: TierView[] = [
  { sectionId: 1, name: 'Stalls', faceCents: 9600, feeCents: 720, allInCents: 10320, totalSeats: 100, availableSeats: 50 },
  { sectionId: 2, name: 'Balcony', faceCents: 6400, feeCents: 480, allInCents: 6880, totalSeats: 100, availableSeats: 0 },
]

describe('toggleSeat', () => {
  it('adds a seat and removes it again', () => {
    expect(toggleSeat([], 5).next).toEqual([5])
    expect(toggleSeat([5, 6], 5).next).toEqual([6])
  })

  it('refuses a seat beyond the limit, and says why, without changing the choice', () => {
    const six = [1, 2, 3, 4, 5, 6]
    expect(toggleSeat(six, 7)).toEqual({ next: six, refused: 'limit' })
  })

  it('still lets a guest remove a seat when they are at the limit', () => {
    expect(toggleSeat([1, 2, 3, 4, 5, 6], 3).next).toEqual([1, 2, 4, 5, 6])
  })
})

describe('flattenSeats', () => {
  it('knows where each seat is', () => {
    const seats = flattenSeats(map)
    expect(seats.get(17)).toMatchObject({ section: 'Stalls', row: 'E', number: 7, sectionId: 1 })
    expect(seats.get(30)).toMatchObject({ section: 'Balcony', status: 'SOLD' })
    expect(seats.size).toBe(3)
  })
})

describe('summarise', () => {
  it('adds up face value and fees the way the order will, so $206.40 is $206.40 everywhere', () => {
    const seats = flattenSeats(map)
    const summary = summarise([17, 18], seats, tiers)
    expect(summary.subtotalCents).toBe(19200)
    expect(summary.feeCents).toBe(1440)
    expect(summary.totalCents).toBe(20640)
    expect(summary.lines.map((l) => seatLabel(l.seat))).toEqual(['E7', 'E8'])
  })

  it('prices seats in different sections separately', () => {
    const seats = flattenSeats(map)
    expect(summarise([17, 30], seats, tiers).totalCents).toBe(10320 + 6880)
  })

  it('is empty for no seats, and ignores a seat it does not know', () => {
    expect(summarise([], flattenSeats(map), tiers).totalCents).toBe(0)
    expect(summarise([999], flattenSeats(map), tiers).lines).toEqual([])
  })
})

describe('listSeats', () => {
  it('reads like a sentence', () => {
    expect(listSeats(['E7'])).toBe('E7')
    expect(listSeats(['E7', 'E8'])).toBe('E7 and E8')
    expect(listSeats(['E7', 'E8', 'E9'])).toBe('E7, E8 and E9')
  })
})
