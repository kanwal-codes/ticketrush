import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EventDetail } from '../../api/types'
import { resetServerTime } from '../../lib/time'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const event: EventDetail = {
  id: 7,
  title: 'Afterlight Tour',
  artist: 'Mira Okafor',
  description: 'Two hours of new songs.',
  startsAt: '2026-11-14T20:00:00Z',
  doorsAt: '2026-11-14T19:00:00Z',
  dropOpensAt: '2026-10-09T13:50:00Z',
  onSaleAt: '2026-10-09T14:00:00Z',
  saleState: 'ON_SALE',
  serverTime: '2026-10-09T14:05:00Z',
  venueName: 'Halden Hall',
  city: 'Montreal',
  poster: { style: 'ORBIT', inkOne: '#2b2fd9', inkTwo: '#ff5a36', paperColor: '#ffd9c4' },
  tiers: [
    { sectionId: 1, name: 'Floor', faceCents: 12800, feeCents: 960, allInCents: 13760, totalSeats: 500, availableSeats: 120 },
    { sectionId: 2, name: 'Balcony', faceCents: 6400, feeCents: 480, allInCents: 6880, totalSeats: 300, availableSeats: 0 },
  ],
  totalSeats: 2000,
  availableSeats: 1500,
  waitingRoom: true,
  cancelled: false,
}

beforeEach(() => resetServerTime())

describe('EventPage', () => {
  it('shows the facts, the final price of each section and how many seats are left', async () => {
    mockApi({ 'GET /api/events/7': () => json(event) })
    renderRoute('/events/7')

    expect(await screen.findByRole('heading', { level: 1, name: 'Afterlight Tour' })).toBeInTheDocument()
    expect(screen.getByText('Halden Hall, Montreal')).toBeInTheDocument()
    expect(screen.getByText('2,000 reserved seats')).toBeInTheDocument()

    const tiers = screen.getAllByRole('listitem')
    expect(within(tiers[0]!).getByText('Floor')).toBeInTheDocument()
    expect(within(tiers[0]!).getByText('$137.60')).toBeInTheDocument()
    expect(within(tiers[0]!).getByText('120 left')).toBeInTheDocument()
    expect(within(tiers[1]!).getByText('Sold out')).toBeInTheDocument()
    expect(screen.getByText(/final price, fees included/)).toBeInTheDocument()
    expect(screen.getByText(/you have 10 minutes to pay/)).toBeInTheDocument()
  })

  it('sends guests to the waiting room when the sale is on', async () => {
    mockApi({ 'GET /api/events/7': () => json(event) })
    renderRoute('/events/7')
    expect(await screen.findByRole('link', { name: 'Join the waiting room' })).toHaveAttribute('href', '/events/7/queue')
  })

  it('counts down on the server clock and disables the button before the waiting room opens', async () => {
    mockApi({ 'GET /api/events/7': () => json({ ...event, saleState: 'UPCOMING', serverTime: '2026-10-09T13:00:00Z' }) })
    renderRoute('/events/7')

    expect(await screen.findByRole('heading', { name: 'Tickets go on sale in' })).toBeInTheDocument()
    // An hour on the server's clock, give or take the moment the test took.
    expect(screen.getByRole('timer').textContent).toMatch(/^(01:00:0\d|00:59:5\d)$/)
    expect(screen.getByRole('button', { name: /Waiting room opens at/ })).toBeDisabled()
  })

  it('goes straight to seats when there is no waiting room', async () => {
    mockApi({ 'GET /api/events/7': () => json({ ...event, waitingRoom: false }) })
    renderRoute('/events/7')
    expect(await screen.findByRole('link', { name: 'Choose seats' })).toHaveAttribute('href', '/events/7/seats')
  })

  it('says when the event is sold out or over, with no way in', async () => {
    mockApi({ 'GET /api/events/7': () => json({ ...event, availableSeats: 0 }) })
    renderRoute('/events/7')
    expect(await screen.findByRole('heading', { name: 'Sold out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /waiting room|Choose seats/ })).not.toBeInTheDocument()
  })

  it('shows the error screen for an event that does not exist', async () => {
    mockApi({ 'GET /api/events/99': () => json({ title: 'Not found', detail: 'Event 99 not found' }, 404) })
    renderRoute('/events/99')
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find that')
  })

  it('treats a nonsense address as not found without asking the server', async () => {
    const { calls } = mockApi({})
    renderRoute('/events/abc')
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('says an event was cancelled and shows nothing to buy: no prices, no seats left', async () => {
    mockApi({ 'GET /api/events/7': () => json({ ...event, cancelled: true, saleState: 'ENDED' }) })
    renderRoute('/events/7')
    expect(await screen.findByRole('heading', { name: 'This event was cancelled' })).toBeInTheDocument()
    expect(screen.getByText(/refunded automatically/)).toBeInTheDocument()
    expect(screen.queryByText(/with fees/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/left$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Choose seats|Join the waiting room/ })).not.toBeInTheDocument()
  })

  it('says the same thing once, not twice, before the sale: the button gives the time, the note says what it is for', async () => {
    mockApi({ 'GET /api/events/7': () => json({ ...event, saleState: 'UPCOMING', serverTime: '2026-10-09T13:00:00Z' }) })
    renderRoute('/events/7')
    await screen.findByRole('heading', { name: 'Tickets go on sale in' })
    expect(screen.getAllByText(/waiting room opens/i)).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/\.\./)
  })
})
