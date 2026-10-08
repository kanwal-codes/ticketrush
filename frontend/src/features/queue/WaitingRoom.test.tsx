import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getToken, setToken } from '../../auth/session'
import { resetServerTime } from '../../lib/time'
import { eventDetail, queueView } from '../../test/fixtures'
import { json, mockApi, sseStream } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { getAdmission } from './admission'
import { timings } from './useWaitingRoom'

const original = { retry: [...timings.retry], poll: timings.poll }

beforeEach(() => {
  setToken('abc')
  resetServerTime()
  timings.retry = [5, 5, 5]
  timings.poll = 10
})

afterEach(() => {
  timings.retry = original.retry
  timings.poll = original.poll
})

describe('WaitingRoom', () => {
  it('joins the line, shows the place and follows it live with the guest\'s token', async () => {
    const stream = sseStream()
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => stream.response,
    })
    renderRoute('/events/7/queue')

    expect(await screen.findByText('312')).toBeInTheDocument()
    expect(screen.getByText('people ahead of you')).toBeInTheDocument()
    expect(screen.getByText('#313')).toBeInTheDocument()
    expect(screen.getByText('About 4 min')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    stream.send(queueView({ aheadOfYou: 250, position: 251, estimatedWaitSeconds: 180 }))
    expect(await screen.findByText('250')).toBeInTheDocument()
    expect(screen.getByText('#251')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')

    const streamCall = calls.find((c) => new URL(c.url).pathname.endsWith('/queue/stream'))
    expect(streamCall?.headers.get('Authorization')).toBe('Bearer abc')
  })

  it('says the guest is next, once, when nobody is ahead', async () => {
    const stream = sseStream()
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView({ aheadOfYou: 0, position: 1, queueLength: 1 })),
      'GET /api/events/7/queue/stream': () => stream.response,
    })
    renderRoute('/events/7/queue')
    expect(await screen.findAllByText('You are next')).toHaveLength(2) // the headline, and the sentence for screen readers
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('is told it is the guest\'s turn, keeps the admission token and goes to the seats', async () => {
    const stream = sseStream()
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => stream.response,
    })
    const { router } = renderRoute('/events/7/queue')
    await screen.findByText('312')

    stream.send(queueView({ state: 'ADMITTED', position: null, aheadOfYou: 0, admissionToken: 'admit-token', admittedUntil: '2026-10-09T14:15:00Z' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/seats'))
    expect(getAdmission(7)).toBe('admit-token')
  })

  it('goes straight through when the guest is already let in, without opening a stream', async () => {
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView({ state: 'ADMITTED', admissionToken: 'already', admittedUntil: '2026-10-09T14:15:00Z', aheadOfYou: 0 })),
    })
    const { router } = renderRoute('/events/7/queue')
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/seats'))
    expect(getAdmission(7)).toBe('already')
    expect(calls.some((c) => c.url.includes('/stream'))).toBe(false)
  })

  it('keeps going by polling when the stream will not stay up, and says so', async () => {
    let admit = false
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => json({ title: 'Bad gateway' }, 502),
      'GET /api/events/7/queue': () =>
        json(admit ? queueView({ state: 'ADMITTED', aheadOfYou: 0, admissionToken: 'polled', admittedUntil: '2026-10-09T14:15:00Z' }) : queueView({ aheadOfYou: 100, position: 101 })),
    })
    const { router } = renderRoute('/events/7/queue')

    // The page stays useful, and is honest that updates are slower, while polling carries it.
    expect(await screen.findByText(/refreshes every few seconds/)).toBeInTheDocument()
    expect(await screen.findByText('100')).toBeInTheDocument()

    admit = true
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/seats'), { timeout: 3000 })
    expect(getAdmission(7)).toBe('polled')
  })

  it('reconnects when the stream drops, and carries on from the guest\'s place', async () => {
    const first = sseStream()
    const second = sseStream()
    let opened = 0
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => (++opened === 1 ? first.response : second.response),
    })
    renderRoute('/events/7/queue')
    await screen.findByText('312')

    first.close()
    second.send(queueView({ aheadOfYou: 90, position: 91 }))

    expect(await screen.findByText('90')).toBeInTheDocument()
    expect(opened).toBe(2)
  })

  it('does not join before the waiting room opens, and counts down to it', async () => {
    const { calls } = mockApi({ 'GET /api/events/7': () => json(eventDetail({ saleState: 'UPCOMING' })) })
    renderRoute('/events/7/queue')

    expect(await screen.findByRole('heading', { name: 'The waiting room is not open yet' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('explains it when the server says the waiting room is closed', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json({ title: 'Waiting room closed', detail: 'This event has already started' }, 409),
    })
    renderRoute('/events/7/queue')
    expect(await screen.findByRole('heading', { name: 'The waiting room is closed' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This event has already started')
  })

  it('offers to try again when joining fails', async () => {
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json({ title: 'Slow down', detail: 'Too many requests' }, 429, { 'Retry-After': '5' }),
    })
    renderRoute('/events/7/queue')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests')
  })

  it('asks before leaving, then leaves and goes back to the event', async () => {
    const stream = sseStream()
    const { calls } = mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => stream.response,
      'DELETE /api/events/7/queue': () => new Response(null, { status: 204 }),
    })
    const { router } = renderRoute('/events/7/queue')
    await screen.findByText('312')

    await userEvent.click(screen.getByRole('button', { name: 'Leave the queue' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false) // nothing happens until they confirm
    await userEvent.click(screen.getByRole('button', { name: 'Yes, leave the queue' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7'))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('lets a guest change their mind about leaving', async () => {
    const stream = sseStream()
    mockApi({
      'GET /api/events/7': () => json(eventDetail()),
      'POST /api/events/7/queue': () => json(queueView()),
      'GET /api/events/7/queue/stream': () => stream.response,
    })
    renderRoute('/events/7/queue')
    await screen.findByText('312')
    await userEvent.click(screen.getByRole('button', { name: 'Leave the queue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stay in line' }))
    expect(screen.getByRole('button', { name: 'Leave the queue' })).toBeInTheDocument()
  })

  it('skips the queue for an event that has no waiting room', async () => {
    mockApi({ 'GET /api/events/7': () => json(eventDetail({ waitingRoom: false })) })
    const { router } = renderRoute('/events/7/queue')
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7/seats'))
  })

  it('sends a signed-out visitor to sign in, and brings them back', async () => {
    sessionStorage.clear()
    mockApi({})
    const { router } = renderRoute('/events/7/queue')
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'))
    expect(router.state.location.state).toEqual({ from: '/events/7/queue' })
    expect(getToken()).toBeNull()
  })
})
