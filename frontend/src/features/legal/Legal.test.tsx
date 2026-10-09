import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

afterEach(() => vi.unstubAllEnvs())

describe('legal pages', () => {
  it.each([
    ['/terms', 'Terms of use', /test mode/i],
    ['/privacy', 'Privacy', /salted hash/i],
    ['/refunds', 'Refunds', /cancelled/i],
    ['/contact', 'Contact', /GitHub/],
  ])('%s says what it is and when it was written', async (path, title, text) => {
    mockApi({})
    renderRoute(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(/Last updated \d+ \w+ \d{4}/)).toBeInTheDocument()
    expect(screen.getAllByText(text).length).toBeGreaterThan(0)
  })

  it('are linked from every page\'s footer', async () => {
    mockApi({ 'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }) })
    renderRoute('/')
    const footer = await screen.findByRole('navigation', { name: 'About' })
    expect(within(footer).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Refunds', '/refunds'],
      ['Contact', '/contact'],
    ])
  })

  it('has the account page linked for the things a guest can do themselves', async () => {
    mockApi({})
    renderRoute('/privacy')
    await screen.findByRole('heading', { level: 1, name: 'Privacy' })
    expect(screen.getAllByRole('link', { name: 'your account' })[0]).toHaveAttribute('href', '/account')
  })

  it('shows the support address when the build has one, and the issue page when it does not', async () => {
    mockApi({})
    renderRoute('/contact')
    expect(await screen.findByRole('link', { name: /issue page on GitHub/ })).toHaveAttribute('href', expect.stringContaining('github.com'))
  })

  it('uses the configured support address', async () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'help@tickets.example')
    mockApi({})
    renderRoute('/contact')
    expect(await screen.findByRole('link', { name: 'help@tickets.example' })).toHaveAttribute('href', 'mailto:help@tickets.example')
  })

  it('sign-up says what creating an account agrees to', async () => {
    mockApi({})
    renderRoute('/register')
    expect(await screen.findByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms')
    expect(screen.getAllByRole('link', { name: 'Privacy' })[0]).toHaveAttribute('href', '/privacy')
  })
})
