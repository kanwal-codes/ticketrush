import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { getToken, setToken } from '../auth/session'
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
  it('shows the brand, the main links and a skip link', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ticketrush, home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My tickets' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
  })

  it('offers to sign out when signed in, and signing out clears the token', async () => {
    setToken('abc')
    renderAt('/')
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
