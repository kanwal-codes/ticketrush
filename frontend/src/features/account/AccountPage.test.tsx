import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken } from '../../auth/session'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const me = { id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST', emailVerified: true }
const events = { 'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }) }

beforeEach(() => {
  sessionStorage.clear()
  setToken('abc')
})
afterEach(() => vi.restoreAllMocks())

describe('account page', () => {
  it('needs a sign-in', async () => {
    sessionStorage.clear()
    mockApi({})
    const { router } = renderRoute('/account')
    await waitFor(() => expect(router.state.location.pathname).toBe('/signin'))
  })

  it('shows who is signed in and is reached from the header', async () => {
    mockApi({ 'GET /api/me': () => json(me), ...events })
    renderRoute('/')
    await userEvent.click(await screen.findByRole('link', { name: 'Account' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument()
    expect(screen.getByText('Ana, ana@example.org')).toBeInTheDocument()
  })

  it('downloads a copy of the guest\'s data as a file', async () => {
    mockApi({ 'GET /api/me': () => json(me), 'GET /api/me/export': () => json({ account: { email: 'ana@example.org' }, orders: [], emails: [] }) })
    const created: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => (created.push(blob), 'blob:data'))
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderRoute('/account')

    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(JSON.parse(await created[0]!.text())).toEqual({ account: { email: 'ana@example.org' }, orders: [], emails: [] })
  })

  it('says so when the data cannot be prepared', async () => {
    mockApi({ 'GET /api/me': () => json(me), 'GET /api/me/export': () => json({ title: 'Server error' }, 503) })
    renderRoute('/account')
    await userEvent.click(await screen.findByRole('button', { name: 'Download my data' }))
    expect(await screen.findByText('We could not prepare your data')).toBeInTheDocument()
  })

  it('closes the account with the password, signs out and says goodbye', async () => {
    const { calls } = mockApi({ 'GET /api/me': () => json(me), 'POST /api/me/close': () => new Response(null, { status: 204 }) })
    const { router } = renderRoute('/account')
    await userEvent.type(await screen.findByLabelText('Your password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Close my account' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/goodbye'))
    expect(await calls.find((c) => c.url.endsWith('/api/me/close'))!.json()).toEqual({ password: 'correct-horse' })
    expect(getToken()).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Your account is closed' })).toBeInTheDocument()
  })

  it('does not sign anyone out just because they opened the goodbye page', async () => {
    mockApi({})
    renderRoute('/goodbye')
    expect(await screen.findByRole('heading', { name: 'Your account is closed' })).toBeInTheDocument()
    expect(getToken()).toBe('abc')
  })

  it('asks for the password first', async () => {
    const { calls } = mockApi({ 'GET /api/me': () => json(me) })
    renderRoute('/account')
    await userEvent.click(await screen.findByRole('button', { name: 'Close my account' }))
    expect(await screen.findByText('Enter your password')).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/api/me/close'))).toBe(false)
  })

  it('says why when closing is refused, and stays signed in', async () => {
    mockApi({
      'GET /api/me': () => json(me),
      'POST /api/me/close': () => json({ title: 'Cannot close the account', detail: 'You still have tickets for an event that has not happened yet.' }, 409),
    })
    renderRoute('/account')
    await userEvent.type(await screen.findByLabelText('Your password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Close my account' }))
    expect(await screen.findByText('You still have tickets for an event that has not happened yet.')).toBeInTheDocument()
    expect(getToken()).toBe('abc')
  })
})
