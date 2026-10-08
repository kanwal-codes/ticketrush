import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'
import { RequireAuth } from './RequireAuth'
import { setToken } from './session'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { element: <RequireAuth />, children: [{ path: '/tickets', element: <p>Your tickets</p> }] },
      { path: '/signin', element: <p>Sign in page</p> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('RequireAuth', () => {
  it('sends a signed-out guest to sign in and remembers where they were going', () => {
    const router = renderAt('/tickets?tab=past')
    expect(screen.getByText('Sign in page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/tickets?tab=past' })
  })

  it('lets a signed-in guest through', () => {
    setToken('abc')
    renderAt('/tickets')
    expect(screen.getByText('Your tickets')).toBeInTheDocument()
  })
})

describe('safeRedirect', () => {
  it('keeps paths on this site', () => {
    expect(safeRedirect('/events/7/seats')).toBe('/events/7/seats')
    expect(safeRedirect('/tickets?tab=past')).toBe('/tickets?tab=past')
  })

  it('refuses anything that could leave the site', () => {
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(42)).toBe('/')
  })
})
