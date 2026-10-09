import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { EventRow, ScanRow, VenueView } from '../../api/types'
import { setToken } from '../../auth/session'
import { guestMe, organizer, summary } from '../../test/fixtures'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const row = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 7,
  title: 'Afterlight Tour',
  status: 'PUBLISHED',
  startsAt: '2026-11-14T20:00:00Z',
  venueName: 'Halden Hall',
  city: 'Montreal',
  capacity: 100,
  sold: 12,
  grossCents: 123_600,
  ...overrides,
})

const pageOf = (items: EventRow[], page = 0, totalPages = 1) => ({ items, page, size: 20, totalItems: items.length, totalPages })

const venue: VenueView = { id: 5, name: 'Halden Hall', city: 'Montreal', totalSeats: 300, sections: [{ id: 11, name: 'Floor', seats: 100 }, { id: 12, name: 'Balcony', seats: 200 }] }

beforeEach(() => setToken('abc'))

describe('the console is for organizers', () => {
  it('turns a guest away with a plain explanation and a way back', async () => {
    mockApi({ 'GET /api/me': () => json(guestMe) })
    renderRoute('/console')
    expect(await screen.findByRole('heading', { name: 'This part of TicketRush is for organizers' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See what is on' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Console' })).not.toBeInTheDocument()
  })

  it('sends someone who is not signed in to sign in', async () => {
    sessionStorage.clear()
    mockApi({})
    renderRoute('/console')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an organizer their events, with the Console link in the header', async () => {
    mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/events': () => json(pageOf([row(), row({ id: 8, title: 'Draft Show', status: 'DRAFT', sold: 0, grossCents: 0 })])),
    })
    renderRoute('/console')

    expect(await screen.findByRole('heading', { name: 'Your events' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Afterlight Tour/ })).toHaveAttribute('href', '/console/events/7')
    expect(screen.getByText('12 of 100 sold')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Console' })).toBeInTheDocument()
  })

  it('invites a new organizer to make their first event', async () => {
    mockApi({ 'GET /api/me': () => json(organizer), 'GET /api/organizer/events': () => json(pageOf([], 0, 0)) })
    renderRoute('/console')
    expect(await screen.findByRole('heading', { name: 'No events yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first event' })).toHaveAttribute('href', '/console/events/new')
  })

  it('says so, with a retry, when the events cannot be loaded', async () => {
    let failing = true
    mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/events': () => (failing ? json({ title: 'Down' }, 503) : json(pageOf([row()]))),
    })
    renderRoute('/console')
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your events')
    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Afterlight Tour/ })).toBeInTheDocument()
  })
})

describe('a long list of events', () => {
  it('shows a page at a time and fetches the next when asked', async () => {
    const pages: Record<string, ReturnType<typeof pageOf>> = {
      '0': pageOf([row({ id: 1, title: 'First Show' })], 0, 2),
      '1': pageOf([row({ id: 2, title: 'Second Show' })], 1, 2),
    }
    const { calls } = mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/events': (request) => json(pages[new URL(request.url).searchParams.get('page') ?? '0']),
    })
    renderRoute('/console')

    expect(await screen.findByRole('link', { name: /First Show/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Second Show/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show more events' }))
    expect(await screen.findByRole('link', { name: /Second Show/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /First Show/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show more events' })).not.toBeInTheDocument()
    expect(calls.filter((c) => c.url.includes('/api/organizer/events?')).map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['0', '1'])
  })
})

describe('editing a draft', () => {
  const draftEvent = {
    id: 7,
    status: 'DRAFT' as const,
    title: 'Old Title',
    artist: 'Old Artist',
    description: 'About it.',
    venueId: 5,
    startsAt: '2027-03-10T01:00:00Z',
    doorsAt: '2027-03-10T00:00:00Z',
    dropOpensAt: '2027-02-01T14:30:00Z',
    onSaleAt: '2027-02-01T15:00:00Z',
    poster: { style: 'SUN' as const, inkOne: '#121212', inkTwo: '#e5322d', paperColor: '#ffc20e' },
    prices: [{ sectionId: 11, priceCents: 9600 }, { sectionId: 12, priceCents: 6450 }],
    waitingRoom: true,
  }
  const sources = {
    'GET /api/me': () => json(organizer),
    'GET /api/organizer/events/7': () => json(draftEvent),
    'GET /api/venues/5': () => json(venue),
    'GET /api/organizer/events/7/summary': () => json(summary({ status: 'DRAFT' })),
    'GET /api/organizer/events/7/queue': () => json({ waiting: 0, inside: 0 }),
  }

  it('starts from what is saved, keeps the venue fixed, and sends the changes as a replacement', async () => {
    let saved = false
    const { calls } = mockApi({ ...sources, 'PUT /api/events/7': () => ((saved = true), json({ id: 7, status: 'DRAFT' })) })
    renderRoute('/console/events/7/edit')

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Old Title')
    expect(screen.getByLabelText('Artist or company')).toHaveValue('Old Artist')
    expect(screen.getByLabelText(/^Floor/)).toHaveValue('96.00')
    expect(screen.getByLabelText(/^Balcony/)).toHaveValue('64.50')
    expect(screen.getByLabelText('Venue', { exact: true })).toBeDisabled()
    expect(screen.getByLabelText('Style')).toHaveValue('SUN')
    expect(screen.getByRole('checkbox')).toBeChecked()

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'New Title')
    await userEvent.clear(screen.getByLabelText(/^Floor/))
    await userEvent.type(screen.getByLabelText(/^Floor/), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Afterlight Tour' })).toBeInTheDocument() // back on the dashboard
    expect(saved).toBe(true)
    const sent = (await calls.find((c) => c.method === 'PUT')!.json()) as Record<string, unknown>
    expect(sent).toMatchObject({ title: 'New Title', venueId: 5, waitingRoom: true })
    expect(sent.prices).toEqual([{ sectionId: 11, priceCents: 10000 }, { sectionId: 12, priceCents: 6450 }])
    expect(sessionStorage.getItem('tr.console.draft')).toBeNull() // editing never touches the create draft
  })

  it('says plainly when the event is no longer a draft', async () => {
    mockApi({ ...sources, 'PUT /api/events/7': () => json({ title: 'Cannot be changed', detail: 'Only a draft can be edited. Cancel this event and create a new one instead.' }, 409) })
    renderRoute('/console/events/7/edit')
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancel this event and create a new one instead.')
  })

  it('is reached from the Edit button on a draft, and not offered on a published event', async () => {
    mockApi({ ...sources })
    const first = renderRoute('/console/events/7')
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/console/events/7/edit')
    first.unmount()

    mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/events/7/summary': () => json(summary()),
      'GET /api/organizer/events/7/queue': () => json({ waiting: 0, inside: 0 }),
    })
    renderRoute('/console/events/7')
    await screen.findByRole('link', { name: 'Door scanner' })
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
  })
})

describe('creating an event', () => {
  beforeEach(() => sessionStorage.removeItem('tr.console.draft'))

  const dashboardMocks = {
    'GET /api/organizer/events/9/summary': () => json(summary({ eventId: 9, title: 'New Show', status: 'DRAFT' })),
    'GET /api/organizer/events/9/queue': () => json({ waiting: 0, inside: 0 }),
  }

  it('saves a draft at an existing venue, with prices in cents, and opens its dashboard', async () => {
    const { calls } = mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/venues': () => json([venue]),
      'POST /api/events': () => json({ id: 9, status: 'DRAFT' }, 201),
      ...dashboardMocks,
    })
    renderRoute('/console/events/new')

    await userEvent.type(await screen.findByLabelText('Title'), 'New Show')
    await userEvent.type(screen.getByLabelText('Artist or company'), 'Mira Okafor')
    await userEvent.selectOptions(screen.getByLabelText('Venue'), '5')
    await userEvent.type(screen.getByLabelText(/^Floor/), '96')
    await userEvent.type(screen.getByLabelText(/^Balcony/), '64.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'New Show' })).toBeInTheDocument()
    const sent = (await calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/events'))!.json()) as Record<string, unknown>
    expect(sent).toMatchObject({ title: 'New Show', artist: 'Mira Okafor', venueId: 5, waitingRoom: false })
    expect(sent.prices).toEqual([{ sectionId: 11, priceCents: 9600 }, { sectionId: 12, priceCents: 6450 }])
    expect(sessionStorage.getItem('tr.console.draft')).toBeNull()
  })

  it('names what is missing, focuses the first problem, and sends nothing', async () => {
    const { calls } = mockApi({ 'GET /api/me': () => json(organizer), 'GET /api/organizer/venues': () => json([venue]) })
    renderRoute('/console/events/new')

    await userEvent.click(await screen.findByRole('button', { name: 'Save as draft' }))

    expect(await screen.findByText('Give the event a title')).toBeInTheDocument()
    expect(screen.getByText('Say who is playing')).toBeInTheDocument()
    expect(screen.getByText('Choose a venue, or lay out a new one')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus())
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('does not make a second venue when the event is refused and the organizer tries again', async () => {
    let eventAttempts = 0
    const { calls } = mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/venues': () => json([]),
      'POST /api/venues': () => json(venue, 201),
      'POST /api/events': () => (++eventAttempts === 1 ? json({ title: 'Down' }, 503) : json({ id: 9, status: 'DRAFT' }, 201)),
      ...dashboardMocks,
    })
    renderRoute('/console/events/new')

    await userEvent.type(await screen.findByLabelText('Title'), 'New Show')
    await userEvent.type(screen.getByLabelText('Artist or company'), 'Mira Okafor')
    await userEvent.type(screen.getByLabelText('Venue name'), 'Halden Hall')
    await userEvent.type(screen.getByLabelText('City'), 'Montreal')
    await userEvent.type(screen.getByLabelText(/^Floor/), '96')
    await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))
    expect(await screen.findByText(/not something you did/)).toBeInTheDocument()

    // The venue exists now; the form has switched to using it, so a retry cannot duplicate it.
    expect(screen.getByLabelText('Venue')).toHaveValue('5')
    await userEvent.type(screen.getByLabelText(/^Balcony/), '64')
    await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'New Show' })).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/venues'))).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/events'))).toHaveLength(2)
  })

  it('keeps the draft across a reload and says so', async () => {
    mockApi({ 'GET /api/me': () => json(organizer), 'GET /api/organizer/venues': () => json([venue]) })
    const first = renderRoute('/console/events/new')
    await userEvent.type(await screen.findByLabelText('Title'), 'Half typed')
    first.unmount()

    renderRoute('/console/events/new')
    expect(await screen.findByLabelText('Title')).toHaveValue('Half typed')
    expect(screen.getByText('We kept your draft')).toBeInTheDocument()
  })

  it('warns when the ink and paper are too close to read, and previews the poster as typed', async () => {
    mockApi({ 'GET /api/me': () => json(organizer), 'GET /api/organizer/venues': () => json([venue]) })
    renderRoute('/console/events/new')
    await userEvent.type(await screen.findByLabelText('Title'), 'Preview Me')
    expect(screen.getByRole('complementary', { name: 'Poster preview' })).toBeInTheDocument()
    expect(screen.queryByText('The ink and the paper are close in colour')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Paper'), { target: { value: '#2b2fd9' } })
    expect(await screen.findByText('The ink and the paper are close in colour')).toBeInTheDocument()
  })
})

describe('the dashboard', () => {
  const live = (overrides: Parameters<typeof summary>[0] = {}) => ({
    'GET /api/me': () => json(organizer),
    'GET /api/organizer/events/7/summary': () => json(summary(overrides)),
    'GET /api/organizer/events/7/queue': () => json({ waiting: 1234, inside: 150 }),
  })

  it('shows money, seats, the line and the door from the server\'s numbers', async () => {
    mockApi(live())
    renderRoute('/console/events/7')

    expect(await screen.findByRole('heading', { level: 1, name: 'Afterlight Tour' })).toBeInTheDocument()
    const stats = screen.getByText('Revenue').closest('.dashboard__stat')!
    expect(stats).toHaveTextContent('$4,128.00')
    expect(stats).toHaveTextContent('$3,840.00 tickets + $288.00 fees')
    expect(screen.getByText('40 of 150')).toBeInTheDocument()
    expect(await screen.findByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('150 inside choosing seats')).toBeInTheDocument()
    expect(screen.getByText('12 of 40')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '40 sold, 10 held, 50 available of 100' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Door scanner' })).toHaveAttribute('href', '/console/events/7/scan')
    expect(screen.getByText(/Orders: 20 paid, 1 failed/)).toBeInTheDocument()
  })

  it('publishes a draft only after confirming', async () => {
    let published = false
    const { calls } = mockApi({ ...live({ status: 'DRAFT' }), 'POST /api/events/7/publish': () => ((published = true), json({ id: 7, status: 'PUBLISHED' })) })
    renderRoute('/console/events/7')

    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    const ask = screen.getByText('Publish this event?').closest('[role]')!
    expect(published).toBe(false)
    await userEvent.click(within(ask as HTMLElement).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(published).toBe(true))
    expect(calls.some((c) => c.url.endsWith('/publish'))).toBe(true)
    expect(screen.queryByText('Door scanner')).not.toBeInTheDocument() // a draft has no door yet
  })

  it('warns that cancelling does not refund before cancelling', async () => {
    mockApi(live())
    renderRoute('/console/events/7')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel event' }))
    expect(screen.getByText(/refunded automatically/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.queryByText('Cancel this event?')).not.toBeInTheDocument()
  })

  it('shows a refusal as a notice and leaves the event as it was', async () => {
    mockApi({ ...live({ status: 'DRAFT' }), 'POST /api/events/7/publish': () => json({ title: 'Rule', detail: 'Every section needs a price. Missing: Balcony' }, 400) })
    renderRoute('/console/events/7')
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    await userEvent.click(within(screen.getByText('Publish this event?').closest('[role]') as HTMLElement).getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Every section needs a price. Missing: Balcony')).toBeInTheDocument()
  })

  it('shows the not-yours screen for another organizer\'s event', async () => {
    mockApi({
      'GET /api/me': () => json(organizer),
      'GET /api/organizer/events/7/summary': () => json({ title: 'Not owner', detail: 'x' }, 403),
      'GET /api/organizer/events/7/queue': () => json({ title: 'Not yours' }, 403),
    })
    renderRoute('/console/events/7')
    expect(await screen.findByRole('heading', { level: 1, name: 'This is not yours to open' })).toBeInTheDocument()
  })
})

describe('the door scanner', () => {
  const scans: ScanRow[] = [{ code: 'ABCD1234EFGH5678JKMN9PQ1', outcome: 'VALID', seat: 'Floor A1', at: '2026-11-14T19:30:00Z' }]
  const door = (outcome: Record<string, unknown>) => ({
    'GET /api/me': () => json(organizer),
    'GET /api/organizer/events/7/summary': () => json(summary()),
    'GET /api/organizer/events/7/scans': () => json(scans),
    'POST /api/tickets/scan': () => json(outcome),
  })

  async function scan(code: string) {
    await userEvent.type(await screen.findByLabelText('Ticket code'), `${code}{Enter}`)
  }

  it('keeps the cursor in the box, shows the count, and lists recent scans', async () => {
    mockApi(door({ outcome: 'VALID', seat: 'Floor A1' }))
    renderRoute('/console/events/7/scan')
    const input = await screen.findByLabelText('Ticket code')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('12 of 40 in')
    expect(screen.getByText('ABCD 1234 EFGH 5678 JKMN 9PQ1')).toBeInTheDocument()
  })

  it.each([
    [{ outcome: 'VALID', seat: 'Floor A1' }, 'Let them in', 'Admitted. Floor A1.'],
    [{ outcome: 'ALREADY_USED', seat: 'Floor A1', usedAt: '2026-11-14T19:30:00Z' }, 'Already used', /Floor A1\. This ticket was scanned at/],
    [{ outcome: 'WRONG_EVENT' }, 'Wrong event', /different event/],
    [{ outcome: 'UNKNOWN' }, 'Not a ticket', /No ticket has that code/],
  ])('says what to do for %j', async (result, headline, detail) => {
    const { calls } = mockApi(door(result))
    renderRoute('/console/events/7/scan')
    await scan('abcd1234')

    const answer = await screen.findByText(headline as string)
    expect(answer.closest('[role="status"]')).toHaveTextContent(detail as string)
    const sent = (await calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/tickets/scan'))!.json()) as Record<string, unknown>
    expect(sent).toEqual({ code: 'abcd1234', eventId: 7 })
    expect(screen.getByLabelText('Ticket code')).toHaveValue('')
  })

  it('says so when the check could not be made, instead of showing a stale answer', async () => {
    mockApi({ ...door({}), 'POST /api/tickets/scan': () => json({ title: 'Down' }, 503) })
    renderRoute('/console/events/7/scan')
    await scan('abcd1234')
    expect(await screen.findByText(/not something you did/)).toBeInTheDocument()
    expect(screen.queryByText('Let them in')).not.toBeInTheDocument()
  })
})
