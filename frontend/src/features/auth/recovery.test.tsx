import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getToken, setToken } from '../../auth/session'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const emptyPage = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }
const bad = { title: 'Link not valid', detail: 'This link has expired or was already used. Ask for a new one.' }

beforeEach(() => sessionStorage.clear())

describe('forgot password', () => {
  it('is reached from the sign-in page', async () => {
    mockApi({})
    renderRoute('/signin')
    expect(await screen.findByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('asks for the link and says the same thing whoever the address belongs to', async () => {
    const { calls } = mockApi({ 'POST /api/auth/forgot-password': () => new Response(null, { status: 202 }) })
    renderRoute('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'nobody@example.org')
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }))

    expect(await screen.findByText(/If nobody@example.org has an account/)).toBeInTheDocument()
    expect(await calls[0]!.json()).toEqual({ email: 'nobody@example.org' })
  })

  it('checks the address before asking', async () => {
    const { calls } = mockApi({})
    renderRoute('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }))
    expect(await screen.findByText('That does not look like an email address')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('says so when the request cannot be made', async () => {
    mockApi({ 'POST /api/auth/forgot-password': () => json({ title: 'Slow down', detail: 'Too many attempts.' }, 429, { 'Retry-After': '30' }) })
    renderRoute('/forgot-password')
    await userEvent.type(await screen.findByLabelText('Email'), 'ana@example.org')
    await userEvent.click(screen.getByRole('button', { name: 'Send the link' }))
    expect(await screen.findByText(/going faster than we can keep up with/)).toBeInTheDocument()
  })
})

describe('reset password', () => {
  it('sends the secret from the link with the new password', async () => {
    const { calls } = mockApi({ 'POST /api/auth/reset-password': () => new Response(null, { status: 204 }) })
    renderRoute('/reset-password?token=abc123')
    await userEvent.type(await screen.findByLabelText('New password'), 'a-brand-new-one')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument()
    expect(await calls[0]!.json()).toEqual({ token: 'abc123', password: 'a-brand-new-one' })
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin')
  })

  it('refuses a short password without asking the server', async () => {
    const { calls } = mockApi({})
    renderRoute('/reset-password?token=abc123')
    await userEvent.type(await screen.findByLabelText('New password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('offers a new link when this one has expired or was used', async () => {
    mockApi({ 'POST /api/auth/reset-password': () => json(bad, 400) })
    renderRoute('/reset-password?token=old')
    await userEvent.type(await screen.findByLabelText('New password'), 'a-brand-new-one')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText(bad.detail)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows the server\'s words about the password when it refuses it', async () => {
    mockApi({ 'POST /api/auth/reset-password': () => json({ title: 'Validation failed', errors: { password: 'size must be between 8 and 72' } }, 400) })
    renderRoute('/reset-password?token=abc')
    await userEvent.type(await screen.findByLabelText('New password'), 'long-enough-here')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('size must be between 8 and 72')).toBeInTheDocument()
  })

  it('explains a page opened without its link', async () => {
    mockApi({})
    renderRoute('/reset-password')
    expect(await screen.findByRole('heading', { name: 'This link did not work' })).toBeInTheDocument()
  })
})

describe('confirm email', () => {
  it('uses the link straight away', async () => {
    const { calls } = mockApi({ 'POST /api/auth/verify-email': () => new Response(null, { status: 204 }) })
    renderRoute('/verify-email?token=tok')
    expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument()
    expect(await calls[0]!.json()).toEqual({ token: 'tok' })
    expect(screen.getByRole('link', { name: 'Browse events' })).toHaveAttribute('href', '/')
  })

  it('renews the token of a signed-in guest so the confirmation counts at once', async () => {
    setToken('old-token')
    mockApi({
      'POST /api/auth/verify-email': () => new Response(null, { status: 204 }),
      'POST /api/auth/refresh': () => json({ accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 1800 }),
      'GET /api/me': () => json({ id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST', emailVerified: true }),
    })
    renderRoute('/verify-email?token=tok')
    await screen.findByRole('heading', { name: 'Email confirmed' })
    await waitFor(() => expect(getToken()).toBe('new-token'))
  })

  it('says when the link is no good', async () => {
    mockApi({ 'POST /api/auth/verify-email': () => json(bad, 400) })
    renderRoute('/verify-email?token=old')
    expect(await screen.findByRole('heading', { name: 'This link did not work' })).toBeInTheDocument()
    expect(screen.getByText(bad.detail)).toBeInTheDocument()
  })
})

describe('the confirm-your-email banner', () => {
  const unconfirmed = { id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST', emailVerified: false }

  it('appears only while the address is unconfirmed, and can ask for a new link', async () => {
    setToken('jwt')
    const { calls } = mockApi({
      'GET /api/me': () => json(unconfirmed),
      'GET /api/events': () => json(emptyPage),
      'POST /api/auth/verify-email/resend': () => new Response(null, { status: 204 }),
    })
    renderRoute('/')
    expect(await screen.findByText('Confirm your email to join queues and buy tickets')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send the link again' }))
    expect(await screen.findByText(/We sent a new link to ana@example.org/)).toBeInTheDocument()
    expect(calls.some((c) => c.url.endsWith('/api/auth/verify-email/resend'))).toBe(true)
  })

  it('reports a refusal to send another so soon', async () => {
    setToken('jwt')
    mockApi({
      'GET /api/me': () => json(unconfirmed),
      'GET /api/events': () => json(emptyPage),
      'POST /api/auth/verify-email/resend': () => json({ title: 'Slow down', detail: 'An email was sent a moment ago.' }, 429),
    })
    renderRoute('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Send the link again' }))
    expect(await screen.findByText(/going faster than we can keep up with/)).toBeInTheDocument()
  })

  it('is not shown to a confirmed guest', async () => {
    setToken('jwt')
    mockApi({ 'GET /api/me': () => json({ ...unconfirmed, emailVerified: true }), 'GET /api/events': () => json(emptyPage) })
    renderRoute('/')
    await screen.findByRole('button', { name: /account menu/i })
    expect(screen.queryByText('Confirm your email to join queues and buy tickets')).not.toBeInTheDocument()
  })
})
