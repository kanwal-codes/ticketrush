import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
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

const EVENTS_PAGE = 20

/** The organizer's events, a page at a time, newest first. */
export const useMyEvents = () =>
  useInfiniteQuery({
    queryKey: consoleKeys.events,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => unwrap(api.GET('/api/organizer/events', { params: { query: { page: pageParam, size: EVENTS_PAGE } } })),
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
  })

/** One event as the form edits it, with its venue (which may not be one of the organizer's own listed venues). */
export const useEventToEdit = (id: number) =>
  useQuery({
    queryKey: ['console', 'edit', id] as const,
    queryFn: async () => {
      const event = await unwrap(api.GET('/api/organizer/events/{id}', { params: { path: { id } } }))
      const venue = await unwrap(api.GET('/api/venues/{id}', { params: { path: { id: event.venueId } } }))
      return { event, venue }
    },
    // Fetched fresh each time the form opens, and not while it is being typed in.
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

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

export const updateEvent = (id: number, body: CreateEventRequest) =>
  unwrap(api.PUT('/api/events/{id}', { params: { path: { id } }, body }))

export const publishEvent = (id: number) => unwrap(api.POST('/api/events/{id}/publish', { params: { path: { id } } }))

export const cancelEvent = (id: number) => unwrap(api.POST('/api/events/{id}/cancel', { params: { path: { id } } }))

export const scanTicket = (code: string, eventId: number) => unwrap(api.POST('/api/tickets/scan', { body: { code, eventId } }))
