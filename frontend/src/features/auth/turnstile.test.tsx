import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getToken } from '../../auth/session'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

interface Options {
  callback: (token: string) => void
  appearance: string
  sitekey: string
}

/** A stand-in for Cloudflare's widget, so the test decides when the person "passes" the check. */
function fakeTurnstile() {
  const state: { options?: Options } = {}
  const api = {
    render: vi.fn((_el: HTMLElement, options: Options) => ((state.options = options), 'widget-1')),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  window.turnstile = api as unknown as typeof window.turnstile
  return { api, state }
}

async function fillIn() {
  await userEvent.type(await screen.findByLabelText('Your name'), 'Ana')
  await userEvent.type(screen.getByLabelText('Email'), 'ana@example.org')
  await userEvent.type(screen.getByLabelText('Password'), 'a-long-password')
}

describe('the sign-up bot check', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.turnstile
  })

  it('is not there at all without a site key, and sign-up works as before', async () => {
    const { calls } = mockApi({
      'POST /api/auth/register': () => json({ id: 1 }, 201),
      'POST /api/auth/login': () => json({ accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 1800 }),
      'GET /api/me': () => json({ id: 1, role: 'GUEST', displayName: 'Ana', email: 'ana@example.org' }),
      'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 }),
    })
    renderRoute('/register')
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(getToken()).toBe('jwt-1'))
    const body = (await calls.find((c) => c.url.endsWith('/api/auth/register'))!.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('turnstileToken')
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()
  })

  it('holds the button until the check answers, sends the answer, and asks again after a refusal', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-123')
    const { api, state } = fakeTurnstile()
    let refuse = true
    const { calls } = mockApi({
      'POST /api/auth/register': () => (refuse ? json({ title: 'Check not passed', detail: 'Please complete the check and try again.' }, 400) : json({ id: 1 }, 201)),
      'POST /api/auth/login': () => json({ accessToken: 'jwt-2', tokenType: 'Bearer', expiresIn: 1800 }),
      'GET /api/me': () => json({ id: 1, role: 'GUEST', displayName: 'Ana', email: 'ana@example.org' }),
      'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 }),
    })
    renderRoute('/register')
    await fillIn()

    await waitFor(() => expect(api.render).toHaveBeenCalledOnce())
    expect(state.options).toMatchObject({ sitekey: 'site-key-123', appearance: 'interaction-only' })
    const button = screen.getByRole('button', { name: 'Checking that you are a person…' })
    expect(button).toBeDisabled()

    state.options!.callback('answer-1')
    const create = await screen.findByRole('button', { name: 'Create account' })
    expect(create).toBeEnabled()
    await userEvent.click(create)

    expect(await screen.findByText('Please complete the check and try again.')).toBeInTheDocument()
    const first = (await calls.find((c) => c.url.endsWith('/api/auth/register'))!.json()) as Record<string, unknown>
    expect(first.turnstileToken).toBe('answer-1')
    // Each answer is good once: the widget is reset and the button waits for a new one.
    expect(api.reset).toHaveBeenCalledWith('widget-1')
    expect(await screen.findByRole('button', { name: 'Checking that you are a person…' })).toBeDisabled()

    refuse = false
    state.options!.callback('answer-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(getToken()).toBe('jwt-2'))
  })

  it('is not used on the sign-in page, which the per-address limit protects', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-123')
    const { api } = fakeTurnstile()
    mockApi({})
    renderRoute('/signin')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(api.render).not.toHaveBeenCalled()
  })
})
