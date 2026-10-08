import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { setToken } from '../../auth/session'
import { resetServerTime } from '../../lib/time'
import { eventDetail, holdView, seatMapOf } from '../../test/fixtures'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { getAdmission, saveAdmission } from '../queue/admission'
import { getActiveHold } from './activeHold'

const noHold = () => json({ title: 'Not found', detail: 'You have no active hold for this event' }, 404)
const seat = (n: number, row = 'A') => screen.getByRole('button', { name: new RegExp(`Floor row ${row} seat ${n},`) })

beforeEach(() => {
  setToken('abc')
  resetServerTime()
  saveAdmission(7, 'admit-token', '2026-10-09T14:15:00Z')
})

describe('SeatsPage', () => {
  it('shows every seat, with taken ones marked and the all-in price of the section', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ taken: [101] })),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')

    expect(await screen.findByRole('heading', { name: 'Floor' })).toBeInTheDocument()
    expect(screen.getByText('$103.20 with fees')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Floor row/ })).toHaveLength(10)
    expect(seat(2)).toHaveAttribute('aria-disabled', 'true')
    expect(seat(2)).toHaveAccessibleName(/taken/)
    expect(seat(1)).not.toHaveAttribute('aria-disabled')
  })

  it('adds up what the chosen seats cost, fees included, as the order will', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await userEvent.click(seat(1))
    await userEvent.click(seat(2))

    const panel = screen.getByRole('complementary', { name: 'Your tickets' })
    expect(within(panel).getByText('Floor A1')).toBeInTheDocument()
    expect(within(panel).getByText('$192.00')).toBeInTheDocument() // tickets
    expect(within(panel).getByText('$14.40')).toBeInTheDocument() // fees
    expect(within(panel).getByText('$206.40')).toBeInTheDocument() // total
    expect(within(panel).getByRole('button', { name: 'Hold these 2 seats' })).toBeEnabled()
  })

  it('does not let a guest choose a seventh seat, and says why', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ rows: 1, perRow: 8 })),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    for (let n = 1; n <= 7; n++) await userEvent.click(seat(n))

    expect(screen.getByRole('status')).toHaveTextContent('You can hold up to 6 seats at once.')
    expect(seat(7)).toHaveAttribute('aria-pressed', 'false')
    expect(seat(6)).toHaveAttribute('aria-pressed', 'true')
  })

  it('holds the seats with the admission token and goes to checkout', async () => {
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
      'POST /api/events/7/holds': () => json(holdView(), 201),
    })
    const { router } = renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(seat(1))
    await userEvent.click(seat(2))
    await userEvent.click(screen.getByRole('button', { name: 'Hold these 2 seats' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout/55'))
    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/holds'))
    expect(post?.headers.get('X-Admission-Token')).toBe('admit-token')
    expect(await post?.json()).toEqual({ seatIds: [100, 101] })
    expect(getActiveHold()).toMatchObject({ holdId: 55, eventId: 7 })
  })

  it('keeps the other seats when one was just taken, and holds none until the guest decides', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
      'POST /api/events/7/holds': () => json({ title: 'Seats unavailable', detail: 'Some seats were just taken', unavailableSeatIds: [101] }, 409),
    })
    const { router } = renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(seat(1))
    await userEvent.click(seat(2))
    await userEvent.click(screen.getByRole('button', { name: 'Hold these 2 seats' }))

    expect(await screen.findByText(/A2 was just taken, so none of your seats are held yet/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/events/7/seats')
    expect(seat(1)).toHaveAttribute('aria-pressed', 'true')
    expect(seat(2)).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets go of a chosen seat that someone else takes while the guest is looking', async () => {
    let taken: number[] = []
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ taken })),
      'GET /api/events/7/holds/me': noHold,
    })
    const { queryClient } = renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(seat(1))
    await userEvent.click(seat(3))

    taken = [100]
    await queryClient.invalidateQueries({ queryKey: ['seats', 7] })

    expect(await screen.findByText(/A1 was just taken\. Your other seats are still chosen/)).toBeInTheDocument()
    expect(seat(3)).toHaveAttribute('aria-pressed', 'true')
    expect(seat(1)).toHaveAttribute('aria-disabled', 'true')
  })

  it('finds a hold the guest already has, shows its seats and goes straight to payment', async () => {
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ held: [100, 101] })),
      'GET /api/events/7/holds/me': () => json(holdView()),
    })
    const { router } = renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })

    expect(seat(1)).toHaveAttribute('aria-pressed', 'true')
    expect(seat(2)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('$206.40')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout/55'))
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('releases a hold on request', async () => {
    let released = false
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ held: released ? [] : [100, 101] })),
      'GET /api/events/7/holds/me': () => (released ? noHold() : json(holdView())),
      'DELETE /api/holds/55': () => {
        released = true
        return new Response(null, { status: 204 })
      },
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(screen.getByRole('button', { name: 'Release my seats' }))

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    expect(await screen.findByText('Your seats are released.')).toBeInTheDocument()
    await waitFor(() => expect(getActiveHold()).toBeNull())
    expect(screen.queryByRole('button', { name: 'Release my seats' })).not.toBeInTheDocument()
  })

  it('sends a guest who has not been let in to the waiting room first', async () => {
    sessionStorage.removeItem('tr.admission.7')
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
    })
    const { router } = renderRoute('/events/7/seats')
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/queue'))
  })

  it('does not need the waiting room for an event without one', async () => {
    sessionStorage.removeItem('tr.admission.7')
    mockApi({
      'GET /api/events/7': () => json(eventDetail({ waitingRoom: false })),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')
    expect(await screen.findByRole('heading', { name: 'Floor' })).toBeInTheDocument()
  })

  it('sends the guest back to the queue when the admission has run out', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
      'POST /api/events/7/holds': () => json({ title: 'Waiting room', detail: 'Join the waiting room first', code: 'ADMISSION_REQUIRED' }, 403),
    })
    const { router } = renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(seat(1))
    await userEvent.click(screen.getByRole('button', { name: 'Hold this seat' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/queue'))
    expect(getAdmission(7)).toBeNull()
  })

  it('tells the guest plainly when the connection fails, and that nothing is held', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
      'POST /api/events/7/holds': () => Promise.reject(new TypeError('Failed to fetch')),
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    await userEvent.click(seat(1))
    await userEvent.click(screen.getByRole('button', { name: 'Hold this seat' }))
    expect(await screen.findByText(/your seats are not held yet/)).toBeInTheDocument()
  })
})

describe('seat map keyboard', () => {
  it('has one tab stop and moves with the arrow keys', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf({ rows: 2, perRow: 4 })),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })

    const tabStops = screen.getAllByRole('button', { name: /Floor row/ }).filter((b) => b.tabIndex === 0)
    expect(tabStops).toHaveLength(1)

    seat(1).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(seat(2)).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(seat(2, 'B')).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
    expect(seat(1)).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(seat(4)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(seat(1)).toHaveFocus()
  })

  it('chooses a seat with the keyboard', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'GET /api/events/7/seats': () => json(seatMapOf()),
      'GET /api/events/7/holds/me': noHold,
    })
    renderRoute('/events/7/seats')
    await screen.findByRole('heading', { name: 'Floor' })
    seat(1).focus()
    await userEvent.keyboard(' ')
    expect(seat(1)).toHaveAttribute('aria-pressed', 'true')
  })
})
