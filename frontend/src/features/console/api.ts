import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import type { CreateEventRequest, CreateVenueRequest } from '../../api/types'

/** Everything the console reads. Sales and the line are refetched every few seconds, but not while the tab is hidden. */
export const consoleKeys = {
  events: ['console', 'events'] as const,
  venues: ['console', 'venues'] as const,
  summary: (id: number) => ['console', 'summary', id] as const,
  depth: (id: number) => ['console', 'depth', id] as const,
  scans: (id: number) => ['console', 'scans', id] as const,
}

const LIVE = 5_000

export const useMyEvents = () => useQuery({ queryKey: consoleKeys.events, queryFn: () => unwrap(api.GET('/api/organizer/events')) })

export const useMyVenues = () => useQuery({ queryKey: consoleKeys.venues, queryFn: () => unwrap(api.GET('/api/organizer/venues')) })

export const useSummary = (id: number) =>
  useQuery({
    queryKey: consoleKeys.summary(id),
    queryFn: () => unwrap(api.GET('/api/organizer/events/{id}/summary', { params: { path: { id } } })),
    refetchInterval: LIVE,
  })

export const useQueueDepth = (id: number) =>
  useQuery({
    queryKey: consoleKeys.depth(id),
    queryFn: () => unwrap(api.GET('/api/organizer/events/{eventId}/queue', { params: { path: { eventId: id } } })),
    refetchInterval: LIVE,
  })

export const useScans = (id: number, limit = 20) =>
  useQuery({
    queryKey: consoleKeys.scans(id),
    queryFn: () => unwrap(api.GET('/api/organizer/events/{id}/scans', { params: { path: { id }, query: { limit } } })),
  })

export const createVenue = (body: CreateVenueRequest) => unwrap(api.POST('/api/venues', { body }))

export const createEvent = (body: CreateEventRequest) => unwrap(api.POST('/api/events', { body }))

export const publishEvent = (id: number) => unwrap(api.POST('/api/events/{id}/publish', { params: { path: { id } } }))

export const cancelEvent = (id: number) => unwrap(api.POST('/api/events/{id}/cancel', { params: { path: { id } } }))

export const scanTicket = (code: string, eventId: number) => unwrap(api.POST('/api/tickets/scan', { body: { code, eventId } }))
