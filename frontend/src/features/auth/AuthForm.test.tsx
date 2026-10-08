import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { getToken, setToken } from '../../auth/session'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'
import { validate } from './validate'

const emptyPage = { items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }
const me = { id: 1, email: 'ana@example.org', displayName: 'Ana', role: 'GUEST' }
const token = { accessToken: 'jwt-123', tokenType: 'Bearer', expiresIn: 1800 }

describe('validate', () => {
  it('applies the same rules as the server', () => {
    expect(validate('signin', { displayName: '', email: '', password: '' })).toEqual({ email: 'Enter your email', password: 'Enter your password' })
    expect(validate('register', { displayName: ' ', email: 'nope', password: 'short' })).toEqual({
      displayName: 'Tell us what to call you',
      email: 'That does not look like an email address',
      password: 'Use at least 8 characters',
    })
    expect(validate('register', { displayName: 'Ana', email: 'ana@example.org', password: 'long-enough' })).toEqual({})
  })
})

describe('sign in', () => {
  it('signs in, keeps the token and returns to the page the guest was heading for', async () => {
    mockApi({
      'POST /api/auth/login': () => json(token),
      'GET /api/me': () => json(me),
      'GET /api/events/7': () => json({ title: 'Not found', detail: 'stub' }, 404),
    })
    const { router } = renderRoute('/signin', { from: '/events/7' })
    await screen.findByRole('heading', { level: 1 })

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/events/7'))
    expect(getToken()).toBe('jwt-123')
  })

  it('says plainly that the email and password do not match', async () => {
    mockApi({ 'POST /api/auth/login': () => json({ title: 'Sign-in failed', detail: 'Invalid credentials' }, 401) })
    renderRoute('/signin')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match an account')
    expect(getToken()).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('checks the form before asking the server', async () => {
    const { calls } = mockApi({})
    renderRoute('/signin')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('does not show the form to someone who is already signed in', async () => {
    setToken('abc')
    mockApi({ 'GET /api/me': () => json(me), 'GET /api/events': () => json(emptyPage) })
    const { router } = renderRoute('/signin')
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('does not follow a return address that leaves the site', async () => {
    mockApi({ 'POST /api/auth/login': () => json(token), 'GET /api/me': () => json(me), 'GET /api/events': () => json(emptyPage) })
    const { router } = renderRoute('/signin', { from: '//evil.example/steal' })
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('register', () => {
  it('creates the account and then signs in with the same details', async () => {
    const order: string[] = []
    mockApi({
      'POST /api/auth/register': async (request) => {
        order.push('register')
        expect(await request.json()).toEqual({ displayName: 'Ana', email: 'ana@example.org', password: 'long-enough-pw' })
        return json(me, 201)
      },
      'POST /api/auth/login': () => {
        order.push('login')
        return json(token)
      },
      'GET /api/me': () => json(me),
      'GET /api/events': () => json(emptyPage),
    })
    const { router } = renderRoute('/register')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Your name'), 'Ana')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(order).toEqual(['register', 'login'])
    expect(getToken()).toBe('jwt-123')
  })

  it('puts a duplicate email under the email field', async () => {
    mockApi({ 'POST /api/auth/register': () => json({ title: 'Email already registered', detail: 'That email is already registered' }, 409) })
    renderRoute('/register')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Your name'), 'Ana')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('That email is already registered')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInvalid()
  })

  it('shows the fields the server rejected', async () => {
    mockApi({ 'POST /api/auth/register': () => json({ detail: 'One or more fields are invalid', errors: { displayName: 'size must be between 0 and 80' } }, 400) })
    renderRoute('/register')
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Your name'), 'Ana')
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('size must be between 0 and 80')).toBeInTheDocument()
  })
})
