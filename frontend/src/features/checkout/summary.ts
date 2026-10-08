import type { HoldView } from '../../api/types'

type HeldSeat = HoldView['seats'][number]

/** "Stalls, row E, seats 7 and 8" for one group; several groups are joined with semicolons. */
export function describeSeats(seats: HeldSeat[]): string {
  const groups = new Map<string, HeldSeat[]>()
  for (const seat of seats) {
    const key = `${seat.section}\u0000${seat.row}`
    groups.set(key, [...(groups.get(key) ?? []), seat])
  }
  return [...groups.values()]
    .map((group) => {
      const numbers = group.map((s) => s.number).sort((a, b) => a - b)
      const list = numbers.length === 1 ? `${numbers[0]}` : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
      const first = group[0]!
      return `${first.section}, row ${first.row}, seat${numbers.length === 1 ? '' : 's'} ${list}`
    })
    .join('; ')
}
