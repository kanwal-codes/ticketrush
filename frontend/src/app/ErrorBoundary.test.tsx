import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => undefined))
  afterEach(() => vi.restoreAllMocks())

  it('passes children through when nothing is wrong', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>)
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('replaces a crash with a calm page, a way out and no blame', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary><Boom /></ErrorBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Something broke on our side' })).toBeInTheDocument()
    expect(screen.getByText(/not something you did/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
  })
})
