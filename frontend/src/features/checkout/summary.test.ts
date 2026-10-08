import { describe, expect, it } from 'vitest'
import { describeSeats } from './summary'

const seat = (section: string, row: string, number: number) => ({ seatId: number, section, row, number, faceCents: 9600 })

describe('describeSeats', () => {
  it('names one seat', () => {
    expect(describeSeats([seat('Stalls', 'E', 7)])).toBe('Stalls, row E, seat 7')
  })

  it('names neighbouring seats in a row together', () => {
    expect(describeSeats([seat('Stalls', 'E', 8), seat('Stalls', 'E', 7)])).toBe('Stalls, row E, seats 7 and 8')
    expect(describeSeats([seat('Stalls', 'E', 7), seat('Stalls', 'E', 8), seat('Stalls', 'E', 9)])).toBe('Stalls, row E, seats 7, 8 and 9')
  })

  it('keeps different rows and sections apart', () => {
    expect(describeSeats([seat('Stalls', 'E', 7), seat('Balcony', 'A', 1)])).toBe('Stalls, row E, seat 7; Balcony, row A, seat 1')
  })
})
