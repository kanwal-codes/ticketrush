import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useSearchParams } from 'react-router'
import { useEvents } from '../../api/queries'
import { useTitle } from '../../lib/useTitle'
import { Notice } from '../../components/Notice'
import { describeError } from '../../lib/errorCopy'
import { EventCard, EventCardSkeleton } from './EventCard'
import { Hero } from './Hero'
import { pickFeatured } from './pickFeatured'
import { browseEvents, categories } from './browse'
import './discover.css'

export function Discover() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = categories.find(item => item === params.get('category')) ?? 'All events'
  const city = params.get('city') ?? ''
  const when = ['week', 'weekend'].includes(params.get('when') ?? '') ? params.get('when')! : ''
  const sort = ['price-low', 'price-high', 'name'].includes(params.get('sort') ?? '') ? params.get('sort')! : ''
  const [search, setSearch] = useState({ query: q, text: q })
  if (search.query !== q) setSearch({ query: q, text: q })
  const text = search.text
  const queryClient = useQueryClient()
  // The page's own filter row: the header only takes over the filters once this has scrolled out of view.
  const filterRow = useRef<HTMLElement>(null)
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null)
  const [compact, setCompact] = useState(false)
  useTitle('TicketRush · Discover live events')

  useEffect(() => {
    const host = document.getElementById('discovery-toolbar')
    // The header slot is an element outside this component's tree, so it can only be found once the page is mounted:
    // this is the "sync with something external" case an effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    setToolbarHost(host)
    const header = document.querySelector<HTMLElement>('.site-header')
    const marker = filterRow.current
    if (!host || !header || !marker) return
    let anchor = window.scrollY
    let frame = 0
    let active = false
    let settling = 0
    let version = 0
    let animation: Animation | undefined
    const hideThreshold = 24
    const showThreshold = 12
    const inner = header.querySelector<HTMLElement>('.site-header__inner')
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      const delta = y - anchor
      const filtersInView = marker.getBoundingClientRect().bottom > header.offsetHeight
      const shouldHide = !filtersInView && delta >= hideThreshold
      const shouldShow = filtersInView || delta <= -showThreshold
      if (!shouldHide && !shouldShow) return
      anchor = y
      // Never hide a control while someone is typing, tabbing, or choosing a filter.
      if (header.contains(document.activeElement)) return
      const next = shouldHide
      if (next === active) return
      active = next
      animation?.cancel()
      const mine = ++version
      const commit = () => {
        // A newer change of mind has replaced this one.
        if (mine !== version) return
        // The header changes height, and it sits above the page in the flow, so everything below it would jump by the
        // difference. The height it gives up is kept as space under it instead: the page stays exactly where it is.
        const before = header.offsetHeight
        flushSync(() => setCompact(next))
        header.classList.toggle('site-header--browsing', next)
        header.style.marginBottom = next ? `${Math.max(0, before - header.offsetHeight)}px` : ''
        // Let React and mobile scroll anchoring settle before measuring the next user direction.
        settling = requestAnimationFrame(() => {
          settling = requestAnimationFrame(() => {
            anchor = Math.max(0, window.scrollY)
            settling = 0
            if (inner?.animate && !reducedMotion?.matches) {
              const exiting = animation
              animation = inner.animate([
                { opacity: 0, transform: `translateY(${next ? 9 : -9}px)` },
                { opacity: 1, transform: 'translateY(0)' },
              ], { duration: 190, easing: 'cubic-bezier(.16,1,.3,1)' })
              exiting?.cancel()
            } else animation?.cancel()
          })
        })
      }
      // The page's own filters are back on screen: the header's copy goes at once, never both together.
      if (!next && filtersInView) commit()
      else if (inner?.animate && !reducedMotion?.matches) {
        animation = inner.animate([
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: `translateY(${next ? -6 : 6}px)` },
        ], { duration: 140, easing: 'ease-out', fill: 'forwards' })
        // An animation's finish event is not guaranteed (a background tab or a busy page can delay it), and the header
        // must never be left in the wrong state waiting for it, so a timer applies the change as well.
        let applied = false
        const apply = () => { if (!applied) { applied = true; commit() } }
        animation.onfinish = apply
        window.setTimeout(apply, 200)
      } else commit()
    }
    const onScroll = () => { if (!frame && !settling) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(settling)
      animation?.cancel()
      header.classList.remove('site-header--browsing')
      header.style.marginBottom = ''
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== q) setParams(current => {
        const next = new URLSearchParams(current)
        if (text.trim()) next.set('q', text.trim()); else next.delete('q')
        return next
      }, { replace: true, preventScrollReset: true })
    }, 250)
    return () => clearTimeout(timer)
  }, [text, q, setParams])

  function change(key: string, value: string) {
    setParams(current => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value); else next.delete(key)
      return next
    }, { preventScrollReset: true })
  }
  function clear() { setSearch({ query: '', text: '' }); setParams({}, { preventScrollReset: true }) }

  // Search locally so venues and cities work too; the legacy API searches only titles and artists.
  const { data, isPending, isFetching, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = useEvents('')
  const events = useMemo(() => data?.pages.flatMap(page => page.items) ?? [], [data])
  const filtering = !!(q || city || when || category !== 'All events' || sort)
  // Finish pagination before treating filtered/sorted results as complete.
  useEffect(() => {
    if (filtering && hasNextPage && !isFetching && !isFetchNextPageError) void fetchNextPage()
  }, [filtering, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage])
  const visible = useMemo(() => browseEvents(events, { q, city, when, category, sort }), [events, q, city, when, category, sort])
  const cities = useMemo(() => [...new Set([...events.map(event => event.city), ...(city ? [city] : [])])].sort(), [events, city])
  const featured = filtering ? undefined : pickFeatured(events)
  const listed = featured ? visible.filter(event => event.id !== featured.id) : visible
  const failure = error && !data ? describeError(error, 'the events') : null
  const collecting = filtering && hasNextPage && !isFetchNextPageError

  return (
    <div className="page discover">
      {toolbarHost && createPortal(<form className="discovery-toolbar" role="search" aria-label="Browse events" onSubmit={event => event.preventDefault()}>
        <input hidden={compact} type="search" aria-label="Search events, artists or venues" placeholder="Search events, artists or venues…" autoComplete="off" value={text} onChange={event => setSearch({ query: q, text: event.target.value })} />
        <div className="discovery-toolbar__filters" hidden={!compact}>
        <select aria-label="Browse category" value={category} onChange={event => change('category', event.target.value === 'All events' ? '' : event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
        <select aria-label="Browse city" value={city} onChange={event => change('city', event.target.value)}><option value="">All cities</option>{cities.map(item => <option key={item}>{item}</option>)}</select>
        <select aria-label="Browse date" value={when} onChange={event => change('when', event.target.value)}><option value="">Any date</option><option value="week">Next 7 days</option><option value="weekend">This weekend</option></select>
        <select aria-label="Browse sort" value={sort} onChange={event => change('sort', event.target.value)}><option value="">Soonest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select>
        </div>
      </form>, toolbarHost)}
      <div className="discover__overview">
        {isPending && !filtering && <section className="hero hero--loading" aria-label="Finding featured event"><div className="hero__lead"><p className="hero__edition">Events, everywhere</p><h1>Find something worth showing up for.</h1><p className="hero__description">Concerts, sports, theatre and local events. Find your next thing.</p></div><div className="hero__feature skeleton" aria-hidden="true" /></section>}
        {featured && <Hero event={featured} onTick={() => void queryClient.invalidateQueries({ queryKey: ['events'] })} />}
        {!isPending && !filtering && !featured && <div className="discover__fallback"><p className="hero__edition">Events, everywhere</p><h1>Find something worth showing up for.</h1><p>Concerts, sports, theatre and local events. Find your next thing.</p></div>}
      </div>

      <section aria-labelledby="events-heading" className="discover__list" hidden={!!featured && listed.length === 0 && !hasNextPage}>
        <div className="discover__head">
          <div><h2 id="events-heading">{q ? `Results for “${q}”` : category === 'All events' ? 'What’s on.' : category}</h2><p className="browse__count" role="status">{isPending || collecting ? 'Finding events…' : `${visible.length}${hasNextPage ? '+' : ''} ${visible.length === 1 ? 'event' : 'events'}${city ? ` in ${city}` : ''}`}</p></div>
          <label className="browse__sort"><span>Sort by</span><select aria-label="Sort events" value={sort} onChange={event => change('sort', event.target.value)}><option value="">Soonest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select></label>
        </div>
      <section ref={filterRow} className="browse" aria-label="Filter events">
        <div className="browse__categories" role="group" aria-label="Event categories">{categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => change('category', item === 'All events' ? '' : item)}>{item}</button>)}</div>
        <div className="browse__filters"><div className="browse__selects">
          <label><select aria-label="City" value={city} onChange={event => change('city', event.target.value)}><option value="">All cities</option>{cities.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><select aria-label="Date" value={when} onChange={event => change('when', event.target.value)}><option value="">Any date</option><option value="week">Next 7 days</option><option value="weekend">This weekend</option></select></label>
        </div>{filtering && <button className="browse__clear" type="button" onClick={clear}>Clear filters</button>}</div>
      </section>

        {failure ? <Notice tone={failure.tone} title={failure.title} actions={<button type="button" className="btn btn--quiet" onClick={() => void refetch()}>Try again</button>}>{failure.message}</Notice>
          : isPending || (collecting && !visible.length) ? <ul className="grid" aria-busy="true" aria-label="Loading events">{Array.from({ length: 6 }, (_, i) => <EventCardSkeleton key={i} />)}</ul>
          : visible.length === 0 ? <div className="browse__empty"><h3>{q ? `Nothing matches “${q}”` : 'Nothing matches these filters'}</h3><p>Try another city, date, or category.</p>{filtering && <button type="button" className="btn btn--quiet" onClick={clear}>Clear filters</button>}</div>
          : <ul className="grid" aria-busy={isFetching}>{listed.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}</ul>}
        {isFetchNextPageError && <Notice tone="warning" title="Some events could not load" actions={<button type="button" className="btn btn--quiet" onClick={() => void fetchNextPage()}>Try again</button>}>Your results may be incomplete.</Notice>}
        {hasNextPage && !collecting && !isFetchNextPageError && <p className="discover__more"><button type="button" className="btn btn--quiet" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? 'Loading…' : 'Show more'}</button></p>}
      </section>
    </div>
  )
}
