import { useCallback, useEffect, useRef, useState } from 'react'
import { api, unwrap } from '../../api/client'
import { ApiError, networkError } from '../../api/errors'
import type { QueueView } from '../../api/types'
import { clearToken, getToken } from '../../auth/session'
import { parseEventStream } from '../../lib/sse'
import { clearAdmission, saveAdmission } from './admission'

/** Delays, in milliseconds. A module-level object so tests can shorten them. */
export const timings = { retry: [1000, 2000, 4000], poll: 3000 }

export type Phase = 'joining' | 'waiting' | 'admitted' | 'closed' | 'left' | 'error'
export type Connection = 'live' | 'reconnecting' | 'polling'

export interface WaitingRoom {
  phase: Phase
  view?: QueueView
  error?: ApiError
  connection: Connection
  /** The most people there were ahead of the guest, to draw progress from. */
  startAhead: number
  leave: () => Promise<void>
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

/**
 * Joins the line, then follows the guest's place live. The stream is the main road. If it keeps failing the guest
 * is polled instead, so a proxy that buffers streams or a flaky network costs a few seconds of freshness and
 * nothing else. The place itself lives on the server, so none of this can lose it.
 */
export function useWaitingRoom(eventId: number, enabled: boolean): WaitingRoom {
  const [phase, setPhase] = useState<Phase>('joining')
  const [view, setView] = useState<QueueView>()
  const [error, setError] = useState<ApiError>()
  const [connection, setConnection] = useState<Connection>('live')
  const [startAhead, setStartAhead] = useState(0)
  const controller = useRef<AbortController | null>(null)

  const apply = useCallback(
    (next: QueueView): 'admitted' | 'left' | 'waiting' => {
      setView(next)
      setStartAhead((s) => Math.max(s, next.aheadOfYou))
      if (next.state === 'ADMITTED' && next.admissionToken) {
        saveAdmission(eventId, next.admissionToken, next.admittedUntil)
        setPhase('admitted')
        return 'admitted'
      }
      if (next.state === 'NOT_IN_QUEUE') {
        setPhase('left')
        return 'left'
      }
      setPhase('waiting')
      return 'waiting'
    },
    [eventId],
  )

  useEffect(() => {
    if (!enabled) return
    const abort = new AbortController()
    controller.current = abort
    const { signal } = abort

    async function poll() {
      setConnection('polling')
      while (!signal.aborted) {
        await sleep(timings.poll, signal)
        if (signal.aborted) return
        try {
          const next = await unwrap(api.GET('/api/events/{eventId}/queue', { params: { path: { eventId } } }))
          if (apply(next) !== 'waiting') return
        } catch (e) {
          if (e instanceof ApiError && e.isUnauthorized) return
          // A missed poll is not a problem: try again.
        }
      }
    }

    async function follow() {
      let failures = 0
      while (!signal.aborted) {
        try {
          const response = await fetch(new URL(`/api/events/${eventId}/queue/stream`, location.origin), {
            headers: { Authorization: `Bearer ${getToken() ?? ''}`, Accept: 'text/event-stream' },
            signal,
          })
          if (response.status === 401) return void clearToken()
          if (!response.ok || !response.body) throw new Error(`stream answered ${response.status}`)
          failures = 0
          setConnection('live')
          for await (const message of parseEventStream(response.body)) {
            if (apply(JSON.parse(message.data) as QueueView) !== 'waiting') return
          }
        } catch {
          if (signal.aborted) return
          failures++
        }
        if (failures >= timings.retry.length) return poll()
        setConnection('reconnecting')
        await sleep(timings.retry[Math.min(failures, timings.retry.length - 1)] ?? 1000, signal)
      }
    }

    async function run() {
      try {
        const joined = await unwrap(api.POST('/api/events/{eventId}/queue', { params: { path: { eventId } } }))
        if (signal.aborted) return
        if (apply(joined) === 'waiting') await follow()
      } catch (e) {
        if (signal.aborted) return
        const failure = e instanceof ApiError ? e : networkError(e)
        if (failure.isUnauthorized) return
        setError(failure)
        // The server says the waiting room is shut (not open yet, or none for this event). That is not a fault.
        setPhase(failure.status === 409 ? 'closed' : 'error')
      }
    }

    void run()
    return () => abort.abort()
  }, [eventId, enabled, apply])

  const leave = useCallback(async () => {
    controller.current?.abort()
    clearAdmission(eventId)
    await unwrap(api.DELETE('/api/events/{eventId}/queue', { params: { path: { eventId } } })).catch(() => undefined)
  }, [eventId])

  return { phase, view, error, connection, startAhead, leave }
}
