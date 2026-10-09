/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventSummary } from '../../api/types'
import { resetServerTime } from '../../lib/time'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

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
  it('lists events with their final prices and features the one people are waiting for', async () => {
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Afterlight Tour', 'UPCOMING', 10320), make(2, 'Late Night Jazz', 'ON_SALE', 2150)])) })
    renderRoute('/')

    const hero = await screen.findByRole('region', { name: 'Afterlight Tour' })
    expect(within(hero).getByRole('timer')).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'See the event' })).toHaveAttribute('href', '/events/1')

    const list = await screen.findByRole('list')
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[1]!).getByRole('link')).toHaveAttribute('href', '/events/2')
    expect(within(cards[1]!).getByText('From $21.50')).toBeInTheDocument()
    expect(within(cards[1]!).getByText(/^From \$/)).toBeInTheDocument()
  })

  it('searches as you type and keeps the search in the address', async () => {
    const { calls } = mockApi({
      'GET /api/events': (request) =>
        json(new URL(request.url).searchParams.get('q') === 'jazz' ? page([make(2, 'Late Night Jazz', 'ON_SALE')]) : page([make(1, 'Afterlight Tour', 'ON_SALE'), make(2, 'Late Night Jazz', 'ON_SALE')])),
    })
    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'On now' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search artists and venues' }), 'jazz')

    expect(await screen.findByRole('heading', { name: 'Results for “jazz”' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(router.state.location.search).toBe('?q=jazz')
    expect(calls.some((c) => new URL(c.url).searchParams.get('q') === 'jazz')).toBe(true)
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
    // The banner and the card both open the event.
    expect((await screen.findAllByRole('link', { name: /Afterlight Tour/ })).length).toBeGreaterThanOrEqual(2)
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

  it('opens the event from the banner: the poster, the title and the button are each a link, and nothing is laid over the banner', async () => {
    mockApi({ 'GET /api/events': () => json(page([make(1, 'Afterlight Tour', 'ON_SALE')])) })
    renderRoute('/')
    const banner = await screen.findByRole('region', { name: 'Afterlight Tour' })
    // A keyboard or screen reader meets two links (title and button); the poster's is for the pointer and hidden from them.
    expect(within(banner).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/events/1', '/events/1'])
    expect(within(banner).getByRole('heading', { name: 'Afterlight Tour' }).querySelector('a')).not.toBeNull()
    const poster = banner.querySelector('a.hero__posterlink')
    expect(poster?.getAttribute('href')).toBe('/events/1')
    expect(poster?.getAttribute('aria-hidden')).toBe('true')
    expect(poster?.getAttribute('tabindex')).toBe('-1')
    // An invisible layer over the banner is what made the text unselectable; it must not come back.
    expect(readFileSync(`${process.cwd()}/src/features/discover/discover.css`, 'utf8')).not.toMatch(/\.hero__link::after/)
  })
})

vi.setConfig({ testTimeout: 10_000 })
