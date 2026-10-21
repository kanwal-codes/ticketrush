/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventSummary } from '../../api/types'
import { resetServerTime } from '../../lib/time'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { eventDetail } from '../../test/fixtures'

const make = (id: number, title: string, saleState: EventSummary['saleState'], fromAllInCents = 4515): EventSummary => ({
  id,
  title,
  artist: `Artist ${id}`,
  startsAt: '2026-11-14T20:00:00Z',
  venueName: 'Halden Hall',
  city: 'Montreal',
  dropOpensAt: '2026-10-09T13:50:00Z',
  onSaleAt: '2026-10-09T14:00:00Z',
  saleState,
  fromAllInCents,
  poster: { style: 'ORBIT', inkOne: '#2b2fd9', inkTwo: '#ff5a36', paperColor: '#ffd9c4' },
})

const page = (items: EventSummary[], pageNumber = 0, totalPages = 1) => ({ items, page: pageNumber, size: 12, totalItems: items.length, totalPages })

beforeEach(() => resetServerTime())

describe('Discover', () => {
  it('shows only filters scrolling down, restores search scrolling up, and protects focused controls', async () => {
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Jazz Live', 'ON_SALE')])) })
    const { router } = renderRoute('/')
    const search = await screen.findByRole('searchbox')
    const header = document.querySelector('.site-header')!
    const overview = document.querySelector('.discover__overview')!
    vi.spyOn(overview, 'getBoundingClientRect').mockReturnValue({ bottom: -100 } as DOMRect)
    const scroll = (y: number) => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
      fireEvent.scroll(window)
    }
    try {
      scroll(1000)
      await waitFor(() => expect(header).toHaveClass('site-header--browsing'))
      expect(search).not.toBeVisible()
      expect(screen.getByRole('combobox', { name: 'Browse category' })).toBeVisible()
      await act(() => new Promise(resolve => setTimeout(resolve, 50)))
      scroll(900)
      await waitFor(() => expect(header).not.toHaveClass('site-header--browsing'))
      expect(search).toBeVisible()
      expect(screen.queryByRole('combobox', { name: 'Browse category' })).not.toBeInTheDocument()
      await act(() => new Promise(resolve => setTimeout(resolve, 50)))
      search.focus()
      scroll(1100)
      await act(() => new Promise(resolve => setTimeout(resolve, 40)))
      expect(search).toBeVisible()
      search.blur()
      scroll(1200)
      await waitFor(() => expect(header).toHaveClass('site-header--browsing'))
      await act(() => new Promise(resolve => setTimeout(resolve, 50)))
      scroll(1195)
      await act(() => new Promise(resolve => setTimeout(resolve, 40)))
      expect(header).toHaveClass('site-header--browsing')
      await act(() => router.navigate('/signin'))
      expect(header).not.toHaveClass('site-header--browsing')
    } finally {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    }
  })
  it('loads event data before navigating from a card so the poster is available for the transition', async () => {
    let resolveEvent!: (response: Response) => void
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Jazz Live', 'ON_SALE'), make(2, 'Coming Soon', 'UPCOMING')])), 'GET /api/events/1': () => new Promise<Response>(resolve => { resolveEvent = resolve }) })
    const { router, queryClient } = renderRoute('/')
    queryClient.setQueryDefaults(['event', 1], { gcTime: 60_000 })
    await screen.findByRole('heading', { level: 3, name: 'Jazz Live' })
    const list = screen.getByRole('list')
    await userEvent.click(within(list).getByRole('link'))
    expect(router.state.location.pathname).toBe('/')
    resolveEvent(json(eventDetail({ id: 1, title: 'Jazz Live' })))
    expect(await screen.findByRole('heading', { level: 1, name: 'Jazz Live' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/events/1')
  })
  it('lists events without prices and features the one people are waiting for', async () => {
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Afterlight Tour', 'UPCOMING', 10320), make(2, 'Late Night Jazz', 'ON_SALE', 2150)])) })
    renderRoute('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Find something worth showing up for.' })).toBeInTheDocument()
    expect(screen.getByText(/Concerts, sports, theatre and local events/)).toBeInTheDocument()

    const hero = await screen.findByRole('region', { name: 'Afterlight Tour' })
    expect(within(hero).queryByText(/\$/)).not.toBeInTheDocument()
    expect(within(hero).getByRole('timer')).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'See the event' })).toHaveAttribute('href', '/events/1')

    const list = await screen.findByRole('list')
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]!).getByRole('link')).toHaveAttribute('href', '/events/2')
    expect(within(cards[0]!).queryByText(/\$/)).not.toBeInTheDocument()
  })

  it('searches as you type and keeps the search in the address', async () => {
    mockApi({
      'GET /api/events': (request) =>
        json(new URL(request.url).searchParams.get('q') === 'jazz' ? page([make(2, 'Late Night Jazz', 'ON_SALE')]) : page([make(1, 'Afterlight Tour', 'ON_SALE'), make(2, 'Late Night Jazz', 'ON_SALE')])),
    })
    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'What’s on.' })

    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search events, artists or venues' }), 'jazz')

    expect(await screen.findByRole('heading', { name: 'Results for “jazz”' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(router.state.location.search).toBe('?q=jazz')
    expect(screen.getByRole('link', { name: /Late Night Jazz/ })).toBeInTheDocument()
  })

  it('combines category, city, and sort across all result pages', async () => {
    mockApi({
      'GET /api/events': request => {
        const n = Number(new URL(request.url).searchParams.get('page') ?? 0)
        return json(n === 0 ? page([{ ...make(1, 'Jazz Concert', 'ON_SALE', 7000), city: 'Toronto' }], 0, 2)
          : page([{ ...make(2, 'Acoustic Concert', 'ON_SALE', 3000), city: 'Toronto' }, make(3, 'Stand-up Comedy', 'ON_SALE')], 1, 2))
      },
    })
    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'What’s on.' })
    await userEvent.click(screen.getByRole('button', { name: 'Concerts' }))
    await screen.findByRole('link', { name: /Acoustic Concert/ })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'City' }), 'Toronto')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort events' }), 'price-low')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(within(screen.getAllByRole('listitem')[0]!).getByRole('link')).toHaveAttribute('href', '/events/2')
    expect(new URLSearchParams(router.state.location.search).get('city')).toBe('Toronto')
    expect(new URLSearchParams(router.state.location.search).get('category')).toBe('Concerts')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByRole('button', { name: 'All events' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('finds venues and keeps active city filters while typing', async () => {
    mockApi({ 'GET /api/events': () => json(page([{ ...make(1, 'Jazz Live', 'ON_SALE'), city: 'Toronto', venueName: 'Harbour Centre' }, make(2, 'Another Concert', 'ON_SALE')])) })
    const { router } = renderRoute('/?city=Toronto')
    await screen.findByRole('link', { name: /Jazz Live/ })
    await userEvent.type(screen.getByRole('searchbox'), 'Harbour')
    await screen.findByRole('heading', { name: 'Results for “Harbour”' })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(new URLSearchParams(router.state.location.search).get('city')).toBe('Toronto')
  })

  it('says so when nothing matches', async () => {
    mockApi({ 'GET /api/events': () => json(page([])) })
    renderRoute('/?q=zzz')
    expect(await screen.findByText(/Nothing matches “zzz”/)).toBeInTheDocument()
  })

  it('offers to try again after a failure, and recovers', async () => {
    let failing = true
    mockApi({ 'GET /api/events': () => (failing ? json({ title: 'Server error', detail: 'The server is having a bad day' }, 503) : json(page([make(1, 'Afterlight Tour', 'ON_SALE')]))) })
    renderRoute('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the events')

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Afterlight Tour' })).toBeInTheDocument()
  })

  it('shows more events a page at a time', async () => {
    const { calls } = mockApi({
      'GET /api/events': (request) => {
        const n = Number(new URL(request.url).searchParams.get('page') ?? 0)
        return json(n === 0 ? page([make(1, 'First', 'ON_SALE')], 0, 2) : page([make(2, 'Second', 'ON_SALE')], 1, 2))
      },
    })
    renderRoute('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    expect(await screen.findByRole('link', { name: /Second/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
    expect(calls.some((c) => new URL(c.url).searchParams.get('page') === '1')).toBe(true)
  })

  it('opens the event from the editorial feature and CTA without showing a price', async () => {
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Afterlight Tour', 'ON_SALE')])) })
    renderRoute('/')
    const banner = await screen.findByRole('region', { name: 'Afterlight Tour' })
    expect(within(banner).queryByText('On sale now')).not.toBeInTheDocument()
    expect(within(banner).queryByText(/\$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // Both the CTA and artwork caption are full accessible links to the same event.
    expect(within(banner).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/events/1', '/events/1'])
    expect(within(banner).getByRole('link', { name: /Afterlight Tour/ })).toContainElement(within(banner).getByRole('heading', { name: 'Afterlight Tour' }))
    expect(readFileSync(`${process.cwd()}/src/features/discover/discover.css`, 'utf8')).not.toMatch(/\.hero__link::after/)
  })
})

vi.setConfig({ testTimeout: 10_000 })
