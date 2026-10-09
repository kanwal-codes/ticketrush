import { RollingNumber } from '../../components/RollingNumber'
import { BackBar } from '../../components/BackBar'
import { ErrorScreen } from '../../components/ErrorScreen'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { keys, useEvent } from '../../api/queries'
import type { EventDetail } from '../../api/types'
import { NotFound } from '../../app/RouteError'
import { Countdown } from '../../components/Countdown'
import { QueueSkeleton } from '../../components/PageSkeletons'
import { eventTheme } from '../../lib/eventTheme'
import { formatTime } from '../../lib/time'
import { useTitle } from '../../lib/useTitle'
import { useWaitingRoom } from './useWaitingRoom'
import { aheadText, waitText } from './waitText'
import './queue.css'

export function WaitingRoom() {
  const id = Number(useParams().id)
  return Number.isInteger(id) && id > 0 ? <Room id={id} /> : <NotFound />
}

function Room({ id }: { id: number }) {
  const { data: event, error } = useEvent(id)
  // Joining again after leaving remounts the room, which joins afresh.
  const [attempt, setAttempt] = useState(0)
  if (error && !event) throw error
  if (!event) return <QueueSkeleton />
  return <RoomBody key={attempt} event={event} onRejoin={() => setAttempt((a) => a + 1)} />
}

function RoomBody({ event, onRejoin }: { event: EventDetail; onRejoin: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useTitle(`Waiting room · ${event.title}`)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const open = event.waitingRoom && (event.saleState === 'QUEUE_OPEN' || event.saleState === 'ON_SALE')
  const room = useWaitingRoom(event.id, open)

  useEffect(() => {
    if (room.phase === 'admitted') void navigate(`/events/${event.id}/seats`, { replace: true, viewTransition: true })
  }, [room.phase, event.id, navigate])

  if (!event.waitingRoom) return <Navigate to={`/events/${event.id}/seats`} replace />

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.event(event.id) })

  const shell = (children: React.ReactNode) => (
    <div className="page queue" style={eventTheme(event.poster)}>
      <BackBar to={`/events/${event.id}`}>{event.title}</BackBar>
      <p className="label queue__event">Waiting room</p>
      {children}
    </div>
  )

  if (event.saleState === 'ENDED') {
    return shell(
      <>
        <h1>This event has started</h1>
        <p className="queue__lead">The waiting room is closed.</p>
      </>,
    )
  }

  if (event.saleState === 'UPCOMING') {
    return shell(
      <>
        <h1>The waiting room is not open yet</h1>
        <p className="queue__lead">It opens at {formatTime(event.dropOpensAt)}. Joining then keeps you in line by arrival time.</p>
        <Countdown to={event.dropOpensAt} className="queue__clock" onDone={refresh} />
      </>,
    )
  }

  if (room.phase === 'closed' || room.phase === 'error') {
    const closed = room.phase === 'closed'
    return shell(
      <ErrorScreen
        eyebrow={closed ? 'Queue closed' : 'Could not join'}
        title={closed ? 'The waiting room is closed' : 'We could not put you in the queue'}
        primary={closed ? { label: 'Back to the event', to: `/events/${event.id}` } : { label: 'Try again', onClick: onRejoin }}
        secondary={closed ? undefined : { label: 'Back to the event', to: `/events/${event.id}` }}
      >
        <p>{room.error?.message}</p>
      </ErrorScreen>,
    )
  }

  if (room.phase === 'left') {
    return shell(
      <>
        <h1>You are not in the queue</h1>
        <p className="queue__lead">You left, or the queue was reset. Joining again puts you at the back.</p>
        <p className="queue__actions">
          <button type="button" className="btn" onClick={onRejoin}>
            Join the queue
          </button>
        </p>
      </>,
    )
  }

  const view = room.view
  if (room.phase === 'joining' || !view) {
    return shell(
      <>
        <h1>Joining the queue…</h1>
        <p className="queue__lead" role="status">
          One moment.
        </p>
      </>,
    )
  }

  if (room.phase === 'admitted') {
    return shell(
      <>
        <h1>You are in</h1>
        <p className="queue__lead" role="status">
          Taking you to the seats.
        </p>
      </>,
    )
  }

  const progress = room.startAhead > 0 ? Math.min(1, Math.max(0, 1 - view.aheadOfYou / room.startAhead)) : 0
  const beforeSale = view.saleState === 'QUEUE_OPEN'

  return shell(
    <>
      <h1>You are in the queue.</h1>

      {/* The big number is for the eye; a screen reader gets one plain sentence instead of the pieces. */}
      <p className="queue__ahead" aria-hidden="true">
        {view.aheadOfYou > 0 ? (
          <>
            <RollingNumber className="queue__count num" value={view.aheadOfYou.toLocaleString('en-CA')} />
            <span>{view.aheadOfYou === 1 ? 'person ahead of you' : 'people ahead of you'}</span>
          </>
        ) : (
          <span className="queue__next">You are next</span>
        )}
      </p>
      <p className="visually-hidden">{aheadText(view.aheadOfYou)}</p>

      <div className="queue__bar" role="progressbar" aria-label="Your progress to the front of the line" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="queue__fill" style={{ '--progress': progress } as React.CSSProperties} />
      </div>
      <div className="queue__ends label" aria-hidden="true">
        <span>Back of the line</span>
        <span>Front</span>
      </div>

      <dl className="queue__stats">
        <div>
          <dt className="label">Estimated wait</dt>
          <dd>{beforeSale ? 'Starts at the sale' : waitText(view.estimatedWaitSeconds)}</dd>
        </div>
        <div>
          <dt className="label">Your place</dt>
          <dd className="num">{view.position ? `#${view.position.toLocaleString('en-CA')}` : '–'}</dd>
        </div>
        <div>
          <dt className="label">In line</dt>
          <dd className="num">{view.queueLength.toLocaleString('en-CA')}</dd>
        </div>
      </dl>

      {beforeSale && (
        <p className="queue__note">
          Tickets go on sale at {formatTime(event.onSaleAt)}, in <Countdown to={event.onSaleAt} />. Nobody is let in before then, and your place is kept.
        </p>
      )}

      <p className="queue__saved">Your place is saved. A refresh keeps it, and people are let in by arrival time.</p>

      {room.connection !== 'live' && (
        <p className="queue__connection" role="status">
          {room.connection === 'reconnecting' ? 'Reconnecting… your place is safe.' : 'Live updates are slow right now, so this page refreshes every few seconds. Your place is safe.'}
        </p>
      )}

      <p className="queue__actions">
        {confirmLeave ? (
          <>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => void room.leave().then(() => navigate(`/events/${event.id}`, { viewTransition: true }))}
            >
              Yes, leave the queue
            </button>
            <button type="button" className="btn" onClick={() => setConfirmLeave(false)}>
              Stay in line
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--quiet" onClick={() => setConfirmLeave(true)}>
            Leave the queue
          </button>
        )}
      </p>
    </>,
  )
}

