import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useEvents } from '../../api/queries'
import { useTitle } from '../../lib/useTitle'
import { EventCard, EventCardSkeleton } from './EventCard'
import { Hero } from './Hero'
import { pickFeatured } from './pickFeatured'
import './discover.css'

export function Discover() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [text, setText] = useState(q)
  const queryClient = useQueryClient()
  useTitle('TicketRush · Live events with the final price up front')

  // Typing searches as you go, a moment after you stop, and keeps the search in the address.
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== q) setParams(text ? { q: text } : {}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [text, q, setParams])

  const { data, isPending, isFetching, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useEvents(q)
  const events = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const featured = q ? undefined : pickFeatured(events)

  return (
    <div className="page">
      <h1 className="visually-hidden">Events</h1>

      {featured && <Hero event={featured} onTick={() => void queryClient.invalidateQueries({ queryKey: ['events'] })} />}

      <section aria-labelledby="events-heading" className="discover__list">
        <div className="discover__head">
          <h2 id="events-heading">{q ? `Results for “${q}”` : 'On now'}</h2>
          <form role="search" className="discover__search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="search" className="visually-hidden">
              Search artists and venues
            </label>
            <input id="search" type="search" placeholder="Search artists and venues" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          </form>
        </div>

        {error && !data ? (
          <div className="notice notice--error" role="alert">
            <p>{error.message}</p>
            <p style={{ marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn btn--quiet" onClick={() => void refetch()}>
                Try again
              </button>
            </p>
          </div>
        ) : isPending ? (
          <ul className="grid" aria-busy="true" aria-label="Loading events">
            {Array.from({ length: 6 }, (_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </ul>
        ) : events.length === 0 ? (
          <p className="discover__empty">{q ? `Nothing matches “${q}”. Try another artist or venue.` : 'Nothing is on sale right now. Check back soon.'}</p>
        ) : (
          <>
            <ul className="grid" aria-busy={isFetching && !isFetchingNextPage}>
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </ul>
            {hasNextPage && (
              <p className="discover__more">
                <button type="button" className="btn btn--quiet" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? 'Loading…' : 'Show more'}
                </button>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
