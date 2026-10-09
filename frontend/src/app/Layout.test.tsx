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
    // Signed out, there is no account menu at all: tickets and an account belong to someone signed in.
    expect(screen.queryByRole('button', { name: /account menu/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  })

  it('keeps My tickets, Account and Sign out inside one menu, not loose in the header', async () => {
    setToken('abc')
    mockApi({ 'GET /api/me': () => json({ id: 1, email: 'a@b.co', displayName: 'Ana', role: 'GUEST' }), 'GET /api/events': () => json({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 1 }) })
    renderAt('/')
    const trigger = await screen.findByRole('button', { name: 'Account menu, signed in as Ana' })
    // Closed by default: nothing of the account is loose in the header, just the initial as a badge.
    expect(screen.queryByRole('link', { name: 'My tickets' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(trigger.querySelector('[aria-hidden]')).toHaveTextContent('A')

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('a@b.co')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My tickets' })).toHaveAttribute('href', '/tickets')
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('closes the menu with Escape, returning focus to the trigger, and on an outside click', async () => {
    setToken('abc')
    renderAt('/')
    const trigger = await screen.findByRole('button', { name: /account menu/i })

    await userEvent.click(trigger)
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument()
    await userEvent.click(document.body)
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('offers to sign out from the menu, and signing out clears the token and closes it', async () => {
    setToken('abc')
    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: /account menu/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(getToken()).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('says plainly when a page does not exist', async () => {
    renderAt('/nowhere')
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see what is on/i })).toHaveAttribute('href', '/')
  })
})
