import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import { ApiError } from '../../api/errors'
import { syncServerTime } from '../../lib/time'
import { clearActiveHold, getActiveHold, setActiveHold } from './activeHold'

export const seatKeys = {
  seats: (eventId: number) => ['seats', eventId] as const,
  hold: (eventId: number) => ['hold', eventId] as const,
}

/** The seat map, refreshed every few seconds and whenever the guest comes back to the tab. */
export function useSeatMap(eventId: number) {
  return useQuery({
    queryKey: seatKeys.seats(eventId),
    queryFn: () => unwrap(api.GET('/api/events/{id}/seats', { params: { path: { id: eventId } } })),
    refetchInterval: 3_000,
    refetchOnWindowFocus: true,
  })
}

/** The guest's live hold on this event, or null. Asked of the server, so a refresh or a second tab finds it. */
export function useMyHold(eventId: number) {
  return useQuery({
    queryKey: seatKeys.hold(eventId),
    queryFn: async () => {
      try {
        const hold = await unwrap(api.GET('/api/events/{eventId}/holds/me', { params: { path: { eventId } } }))
        syncServerTime(hold.serverTime)
        setActiveHold({ holdId: hold.id, eventId: hold.eventId, expiresAt: hold.expiresAt })
        return hold
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (getActiveHold()?.eventId === eventId) clearActiveHold()
          return null
        }
        throw e
      }
    },
    refetchOnWindowFocus: true,
  })
}

/** Holds the seats, replacing any earlier hold. All or nothing: if one is gone, none are held. */
export async function holdSeats(eventId: number, seatIds: number[], admissionToken: string | null) {
  const hold = await unwrap(
    api.POST('/api/events/{eventId}/holds', {
      params: { path: { eventId }, header: admissionToken ? { 'X-Admission-Token': admissionToken } : undefined },
      body: { seatIds },
    }),
  )
  syncServerTime(hold.serverTime)
  setActiveHold({ holdId: hold.id, eventId: hold.eventId, expiresAt: hold.expiresAt })
  return hold
}

export async function releaseHold(holdId: number) {
  await unwrap(api.DELETE('/api/holds/{id}', { params: { path: { id: holdId } } }))
  clearActiveHold()
}
