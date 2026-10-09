import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { getToken, setToken } from '../auth/session'
import { json, mockApi } from '../test/mockApi'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('app shell', () => {
  it('styles the footer links in the layout stylesheet, which every page loads, not in a page that loads lazily', () => {
    const css = (file: string) => readFileSync(`${process.cwd()}/src/${file}`, 'utf8')
    expect(css('app/layout.css')).toMatch(/\.site-footer__links\s*{[^}]*display:\s*flex[^}]*justify-content:\s*center/)
    expect(css('features/legal/legal.css')).not.toMatch(/\.site-footer__links/)
  })

  it('shows the brand, the main links and a skip link', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ticketrush, home/i })).toBeInTheDocument()
    // Tickets belong to an account, so the link is only offered to someone signed in.
    expect(screen.queryByRole('link', { name: 'My tickets' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  })

  it('offers My tickets once signed in', async () => {
    setToken('abc')
    renderAt('/')
    expect(await screen.findByRole('link', { name: 'My tickets' })).toBeInTheDocument()
  })

  it('offers to sign out when signed in, and signing out clears the token', async () => {
    setToken('abc')
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(getToken()).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('greets a signed-in guest by name', async () => {
    setToken('abc')
    mockApi({ 'GET /api/me': () => json({ id: 1, email: 'a@b.co', displayName: 'Ana', role: 'GUEST' }), 'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }) })
    renderAt('/')
    expect(await screen.findByText('Ana')).toBeInTheDocument()
  })

  it('says plainly when a page does not exist', async () => {
    renderAt('/nowhere')
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see what is on/i })).toHaveAttribute('href', '/')
  })
})
