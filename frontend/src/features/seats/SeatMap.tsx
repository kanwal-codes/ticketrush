import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SeatMap as SeatMapData, TierView } from '../../api/types'
import { formatMoney } from '../../lib/money'

type SeatState = 'available' | 'selected' | 'taken'

interface Props {
  map: SeatMapData
  tiers: TierView[]
  selected: ReadonlySet<number>
  /** Seats the guest already holds: shown as theirs, not as taken. */
  mine: ReadonlySet<number>
  onToggle: (id: number) => void
}

/**
 * One button per seat in rows, as a seat map should be. Taken seats stay in the page (marked aria-disabled, not
 * removed) so a screen reader can find out they are taken, and the grid has a single tab stop with arrow keys,
 * because tabbing through a thousand seats is not a way to choose one.
 */
export function SeatMap({ map, tiers, selected, mine, onToggle }: Props) {
  const tierBySection = useMemo(() => new Map(tiers.map((t) => [t.sectionId, t])), [tiers])
  const refs = useRef(new Map<number, HTMLButtonElement>())
  const [focusId, setFocusId] = useState<number | null>(null)

  /** Rows of seat ids across the whole map, in reading order, for arrow-key movement. */
  const rows = useMemo(() => map.sections.flatMap((s) => s.rows.map((r) => r.seats.map((seat) => seat.id))), [map])
  const firstAvailable = useMemo(() => map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats)).find((s) => s.status === 'AVAILABLE')?.id ?? rows[0]?.[0] ?? null, [map, rows])
  const tabStop = focusId ?? firstAvailable

  const register = useCallback((id: number, el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }, [])

  const move = useCallback((to: number | undefined) => {
    if (to === undefined) return
    setFocusId(to)
    refs.current.get(to)?.focus()
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const id = Number((e.target as HTMLElement).dataset.seat)
    if (!Number.isFinite(id)) return
    const rowIndex = rows.findIndex((r) => r.includes(id))
    const row = rows[rowIndex]
    if (!row) return
    const col = row.indexOf(id)
    const pick = (r: number, c: number) => rows[r]?.[Math.min(c, (rows[r]?.length ?? 1) - 1)]
    const next: Record<string, number | undefined> = {
      ArrowRight: row[col + 1],
      ArrowLeft: row[col - 1],
      ArrowDown: pick(rowIndex + 1, col),
      ArrowUp: pick(rowIndex - 1, col),
      Home: row[0],
      End: row[row.length - 1],
    }
    if (e.key in next) {
      e.preventDefault()
      move(next[e.key])
    }
  }

  return (
    <div className="seatmap" onKeyDown={onKeyDown} role="group" aria-label="Seat map" aria-describedby="seatmap-help">
      <p id="seatmap-help" className="visually-hidden">
        Use the arrow keys to move between seats, and Space or Enter to choose or unchoose one.
      </p>
      <div className="seatmap__stage" aria-hidden="true">
        Stage
      </div>
      {map.sections.map((section) => {
        const tier = tierBySection.get(section.id)
        const free = section.rows.reduce((n, r) => n + r.seats.filter((s) => s.status === 'AVAILABLE').length, 0)
        return (
          <section key={section.id} className="seatmap__section" aria-label={section.name}>
            <header className="seatmap__header">
              <h3>{section.name}</h3>
              <p className="label">{free === 0 ? 'Sold out' : tier ? formatMoney(tier.allInCents) : ''}</p>
            </header>
            <div className="seatmap__rows">
              {section.rows.map((row) => (
                <div key={row.label} className="seatmap__row" role="group" aria-label={`${section.name} row ${row.label}`}>
                  <span className="seatmap__rowlabel num" aria-hidden="true">
                    {row.label}
                  </span>
                  {row.seats.map((seat) => {
                    const state: SeatState = selected.has(seat.id) ? 'selected' : seat.status === 'AVAILABLE' || mine.has(seat.id) ? 'available' : 'taken'
                    return (
                      <SeatButton
                        key={seat.id}
                        id={seat.id}
                        number={seat.number}
                        state={state}
                        label={`${section.name} row ${row.label} seat ${seat.number}, ${state === 'selected' ? 'chosen' : state}${tier && state !== 'taken' ? `, ${formatMoney(tier.allInCents)}` : ''}`}
                        tabStop={seat.id === tabStop}
                        onToggle={onToggle}
                        onFocus={setFocusId}
                        register={register}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

interface SeatButtonProps {
  id: number
  number: number
  state: SeatState
  label: string
  tabStop: boolean
  onToggle: (id: number) => void
  onFocus: (id: number) => void
  register: (id: number, el: HTMLButtonElement | null) => void
}

const SeatButton = memo(function SeatButton({ id, number, state, label, tabStop, onToggle, onFocus, register }: SeatButtonProps) {
  return (
    <button
      type="button"
      ref={(el) => register(id, el)}
      data-seat={id}
      className={`seat seat--${state}`}
      aria-label={label}
      title={label}
      aria-pressed={state === 'selected'}
      aria-disabled={state === 'taken' ? true : undefined}
      tabIndex={tabStop ? 0 : -1}
      onFocus={() => onFocus(id)}
      onClick={() => state !== 'taken' && onToggle(id)}
    >
      {state === 'selected' ? '✓' : number}
    </button>
  )
})
