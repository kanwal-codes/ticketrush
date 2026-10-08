import { keepPreviousData, useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { syncServerTime } from '../lib/time'
import { api, unwrap } from './client'

const PAGE_SIZE = 12

export const keys = {
  events: (q: string) => ['events', q] as const,
  event: (id: number) => ['event', id] as const,
}

/** The event list, a page at a time. `q` searches artists, titles and venues. */
export function useEvents(q: string) {
  return useInfiniteQuery({
    queryKey: keys.events(q),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET('/api/events', { params: { query: { q: q || undefined, page: pageParam, size: PAGE_SIZE } } })),
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  })
}

/**
 * One event. While the sale has not started it is refetched often so the page flips to "on sale" by itself, and
 * every answer teaches the page how far this machine's clock is from the server's.
 */
async function fetchEvent(id: number) {
  const event = await unwrap(api.GET('/api/events/{id}', { params: { path: { id } } }))
  syncServerTime(event.serverTime)
  return event
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: keys.event(id),
    queryFn: () => fetchEvent(id),
    refetchInterval: (query) => (query.state.data?.saleState === 'ON_SALE' ? 15_000 : 5_000),
  })
}

/** Several events at once, for a page that shows tickets from different events. */
export function useEventsById(ids: number[]) {
  return useQueries({ queries: ids.map((id) => ({ queryKey: keys.event(id), queryFn: () => fetchEvent(id), staleTime: 60_000 })) })
}
