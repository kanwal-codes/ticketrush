import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyTicket } from '../../api/types'
import { getToken, setToken } from '../../auth/session'
import { resetServerTime } from '../../lib/time'
import { eventDetail } from '../../test/fixtures'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const ticket = (id: number, number: number, overrides: Partial<MyTicket> = {}): MyTicket => ({
  id,
  code: `ABCD1234EFGH5678JKMN9PQ${id}`,
  orderReference: 'TR-ABC123',
  eventId: 7,
  section: 'Floor',
  row: 'A',
  number,
  status: 'ISSUED',
  ...overrides,
})

const svg = () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })

beforeEach(() => {
  setToken('abc')
  resetServerTime()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:qr'), revokeObjectURL: vi.fn() }))
})

describe('TicketsPage', () => {
  it('shows each ticket with its seat, the event, the code, and a QR fetched with the guest\'s token', async () => {
    const { calls } = mockApi({
      'GET /api/tickets': () => json([ticket(1, 1), ticket(2, 2)]),
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/tickets/1/qr.svg': svg,
      'GET /api/tickets/2/qr.svg': svg,
    })
    renderRoute('/tickets')

    const section = await screen.findByRole('region', { name: 'Afterlight Tour' })
    const stubs = within(section).getAllByRole('listitem')
    expect(stubs).toHaveLength(2)
    expect(within(stubs[0]!).getByRole('heading', { name: 'Floor, row A, seat 1' })).toBeInTheDocument()
    expect(within(stubs[0]!).getByText(/Halden Hall, Montreal · Doors/)).toBeInTheDocument()
    expect(within(stubs[0]!).getByText('ABCD 1234 EFGH 5678 JKMN 9PQ1')).toBeInTheDocument()

    expect(await within(stubs[0]!).findByRole('img', { name: 'QR code for Floor, row A, seat 1' })).toHaveAttribute('src', 'blob:qr')
    const qrCall = calls.find((c) => c.url.endsWith('/tickets/1/qr.svg'))
    expect(qrCall?.headers.get('Authorization')).toBe('Bearer abc')
  })

  it('groups tickets by event', async () => {
    mockApi({
      'GET /api/tickets': () => json([ticket(1, 1), ticket(3, 1, { eventId: 8 })]),
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/8': () => json(eventDetail({ id: 8, title: 'Late Night Jazz' })),
      'GET /api/tickets/1/qr.svg': svg,
      'GET /api/tickets/3/qr.svg': svg,
    })
    renderRoute('/tickets')
    expect(await screen.findByRole('region', { name: 'Afterlight Tour' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Late Night Jazz' })).toBeInTheDocument()
  })

  it('confirms a purchase just made, with the order and what was paid', async () => {
    mockApi({
      'GET /api/tickets': () => json([ticket(1, 1)]),
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/tickets/1/qr.svg': svg,
    })
    renderRoute('/tickets', { paid: { reference: 'TR-ABC123', totalCents: 20640 } })

    const heading = await screen.findByRole('heading', { name: 'You are going!' })
    expect(heading).toHaveFocus()
    expect(screen.getAllByText('TR-ABC123').length).toBeGreaterThan(0)
    expect(screen.getByText(/\$206\.40 paid/)).toBeInTheDocument()
  })

  it('marks a ticket that has been used', async () => {
    mockApi({
      'GET /api/tickets': () => json([ticket(1, 1, { status: 'USED' })]),
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/tickets/1/qr.svg': svg,
    })
    renderRoute('/tickets')
    expect(await screen.findByText('Used')).toBeInTheDocument()
  })

  it('shows the code as text when the QR cannot be loaded, so the guest can still get in', async () => {
    mockApi({
      'GET /api/tickets': () => json([ticket(1, 1)]),
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/tickets/1/qr.svg': () => json({ title: 'Server error' }, 500),
    })
    renderRoute('/tickets')
    expect(await screen.findByText(/could not load the QR code/)).toBeInTheDocument()
    expect(screen.getByText('ABCD 1234 EFGH 5678 JKMN 9PQ1')).toBeInTheDocument()
  })

  it('says so, and offers a way forward, when there are no tickets', async () => {
    mockApi({ 'GET /api/tickets': () => json([]) })
    renderRoute('/tickets')
    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See what is on' })).toHaveAttribute('href', '/')
  })

  it('needs a signed-in guest', async () => {
    sessionStorage.clear()
    mockApi({})
    const { router } = renderRoute('/tickets')
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'))
    expect(getToken()).toBeNull()
  })

  it('says so, with the voided tickets, when the event was cancelled', async () => {
    const { calls } = mockApi({
      'GET /api/tickets': () => json([ticket(1, 1, { status: 'VOID' }), ticket(2, 2, { status: 'VOID' })]),
      'GET /api/events/7': () => json(eventDetail({ cancelled: true, saleState: 'ENDED' })),
    })
    renderRoute('/tickets')

    const section = await screen.findByRole('region', { name: 'Afterlight Tour' })
    expect(within(section).getByText('This event was cancelled')).toBeInTheDocument()
    expect(within(section).getByText(/Your money is being returned/)).toBeInTheDocument()
    expect(within(section).getAllByText('Cancelled')).toHaveLength(2)
    // Nothing to scan: no QR code is fetched or shown for a cancelled ticket.
    expect(within(section).queryByRole('img')).not.toBeInTheDocument()
    expect(within(section).getAllByText(/no longer works at the door/)).toHaveLength(2)
    expect(calls.some((c) => c.url.includes('qr.svg'))).toBe(false)
  })
})
