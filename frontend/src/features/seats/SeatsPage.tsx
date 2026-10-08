import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/errors'
import { useEvent } from '../../api/queries'
import type { EventDetail, HoldView, SeatMap as SeatMapData } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { clearToken } from '../../auth/session'
import { MAX_SEATS } from '../../lib/constants'
import { eventTheme } from '../../lib/eventTheme'
import { formatMoney } from '../../lib/money'
import { serverNow } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { clearAdmission, getAdmission } from '../queue/admission'
import { clearActiveHold } from './activeHold'
import { holdSeats, releaseHold, seatKeys, useMyHold, useSeatMap } from './api'
import { SeatMap } from './SeatMap'
import { flattenSeats, listSeats, seatLabel, summarise, toggleSeat } from './selection'
import './seats.css'

export function SeatsPage() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <Seats id={id} /> : <NotFound />
}

function Seats({ id }: { id: number }) {
  const event = useEvent(id)
  const map = useSeatMap(id)
  const hold = useMyHold(id)
  const failure = [event, map, hold].find((q) => q.error && !q.data && q.data !== null)?.error
  if (failure) throw failure
  if (!event.data || !map.data || hold.data === undefined) return <div className="page" aria-busy="true" aria-label="Loading seats" />

  // A waiting-room event needs the admission token to hold seats, unless the guest already holds some.
  if (event.data.waitingRoom && !getAdmission(id) && !hold.data) return <Navigate to={`/events/${id}/queue`} replace />
  return <SeatsBody event={event.data} map={map.data} hold={hold.data} />
}

const sameSeats = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x))

function SeatsBody({ event, map, hold }: { event: EventDetail; map: SeatMapData; hold: HoldView | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useTitle(`Choose seats · ${event.title}`)

  const heldIds = useMemo(() => hold?.seats.map((s) => s.seatId) ?? [], [hold])
  const [selected, setSelected] = useState<number[]>(heldIds)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const seats = useMemo(() => flattenSeats(map), [map])
  const mine = useMemo(() => new Set(heldIds), [heldIds])
  // A seat the guest chose that someone else has since taken is let go of, and the guest is told which. This is
  // worked out as the page draws, from the latest map, so it needs no extra state.
  const gone = selected.filter((id) => !mine.has(id) && seats.get(id)?.status !== 'AVAILABLE')
  const effective = gone.length === 0 ? selected : selected.filter((id) => !gone.includes(id))
  const goneMessage =
    gone.length === 0 ? '' : `${listSeats(gone.map((id) => seatLabel(seats.get(id) ?? { row: '?', number: 0 })))} ${gone.length === 1 ? 'was' : 'were'} just taken. Your other seats are still chosen.`
  const chosen = useMemo(() => new Set(effective), [effective])
  const price = useMemo(() => summarise(effective, seats, event.tiers), [effective, seats, event.tiers])
  const isHeld = hold !== null && sameSeats(effective, heldIds)

  // The hold runs out while the guest is looking: put everything back and say so.
  useEffect(() => {
    if (!hold) return
    const ms = Date.parse(hold.expiresAt) - serverNow()
    const timer = setTimeout(() => {
      clearActiveHold()
      setSelected([])
      setMessage('Your hold ended and the seats are back on sale. Choose again if they are still free.')
      void queryClient.invalidateQueries({ queryKey: seatKeys.hold(event.id) })
      void queryClient.invalidateQueries({ queryKey: seatKeys.seats(event.id) })
    }, Math.max(0, ms))
    return () => clearTimeout(timer)
  }, [hold, event.id, queryClient])

  function toggle(seatId: number) {
    setMessage('')
    const { next, refused } = toggleSeat(effective, seatId)
    setSelected(next)
    if (refused) setMessage(`You can hold up to ${MAX_SEATS} seats at once.`)
  }

  async function onContinue() {
    if (isHeld && hold) return void navigate(`/checkout/${hold.id}`)
    setBusy(true)
    setMessage('')
    try {
      const next = await holdSeats(event.id, effective, getAdmission(event.id))
      queryClient.setQueryData(seatKeys.hold(event.id), next)
      void navigate(`/checkout/${next.id}`)
    } catch (e) {
      setBusy(false)
      if (!(e instanceof ApiError)) return setMessage('Something went wrong. Try again.')
      if (e.unavailableSeatIds.length > 0) {
        // All or nothing: none were held. Drop the ones that are gone and keep the rest.
        const labels = e.unavailableSeatIds.map((id) => seatLabel(seats.get(id) ?? { row: '?', number: 0 }))
        setSelected(effective.filter((id) => !e.unavailableSeatIds.includes(id)))
        setMessage(`${listSeats(labels)} ${labels.length === 1 ? 'was' : 'were'} just taken, so none of your seats are held yet. Pick another and continue.`)
        void queryClient.invalidateQueries({ queryKey: seatKeys.seats(event.id) })
      } else if (e.code === 'ADMISSION_REQUIRED') {
        clearAdmission(event.id)
        void navigate(`/events/${event.id}/queue`, { replace: true })
      } else if (e.isUnauthorized) {
        clearToken()
      } else if (e.isNetwork) {
        setMessage('We could not reach the server, so your seats are not held yet. Check your connection and try again.')
      } else {
        setMessage(e.message)
      }
    }
  }

  async function onRelease() {
    if (!hold) return
    setBusy(true)
    try {
      await releaseHold(hold.id)
      setSelected([])
      setMessage('Your seats are released.')
      void queryClient.invalidateQueries({ queryKey: seatKeys.hold(event.id) })
      void queryClient.invalidateQueries({ queryKey: seatKeys.seats(event.id) })
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const total = isHeld && hold ? hold.totalCents : price.totalCents
  const fees = isHeld && hold ? hold.feeCents : price.feeCents
  const subtotal = isHeld && hold ? hold.subtotalCents : price.subtotalCents

  return (
    <div className="page seats" style={eventTheme(event.poster)}>
      <p>
        <Link to={`/events/${event.id}`} className="event__back">
          ← {event.title}
        </Link>
      </p>
      <h1 className="seats__title">Choose your seats</h1>
      <p className="seats__where">
        {event.title}, {event.venueName}
      </p>

      <div className="seats__layout">
        <div className="seats__mapwrap">
          <ul className="legend" aria-label="Key">
            <li><span className="seat seat--available" aria-hidden="true" /> Available</li>
            <li><span className="seat seat--taken" aria-hidden="true" /> Taken</li>
            <li><span className="seat seat--selected" aria-hidden="true" /> Yours</li>
          </ul>
          <SeatMap map={map} tiers={event.tiers} selected={chosen} mine={mine} onToggle={toggle} />
        </div>

        <aside className="panel" aria-labelledby="panel-heading">
          <h2 id="panel-heading">Your tickets</h2>
          <p className="panel__message" role="status" aria-live="polite">
            {message || goneMessage}
          </p>

          {effective.length === 0 ? (
            <p className="panel__empty">Choose up to {MAX_SEATS} seats on the map.</p>
          ) : (
            <>
              <ul className="panel__lines">
                {price.lines.map((l) => (
                  <li key={l.seat.id}>
                    <span>{l.seat.section} {seatLabel(l.seat)}</span>
                    <span className="num">{formatMoney(l.faceCents)}</span>
                  </li>
                ))}
              </ul>
              <dl className="panel__totals">
                <div><dt>Tickets</dt><dd className="num">{formatMoney(subtotal)}</dd></div>
                <div><dt>Fees</dt><dd className="num">{formatMoney(fees)}</dd></div>
                <div className="panel__total"><dt>Total</dt><dd className="num">{formatMoney(total)}</dd></div>
              </dl>
            </>
          )}

          <div className="panel__actions">
            <button type="button" className="btn panel__continue" disabled={effective.length === 0 || busy} onClick={() => void onContinue()}>
              {busy ? 'One moment…' : isHeld ? 'Continue to payment' : effective.length > 0 ? `Hold ${effective.length === 1 ? 'this seat' : `these ${effective.length} seats`}` : 'Continue'}
            </button>
            {hold && (
              <button type="button" className="btn btn--quiet panel__release" disabled={busy} onClick={() => void onRelease()}>
                Release my seats
              </button>
            )}
          </div>
          <p className="panel__note">The prices on the map already include fees. Nothing is added after this step.</p>
        </aside>
      </div>
    </div>
  )
}
