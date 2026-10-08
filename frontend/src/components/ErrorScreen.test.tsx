import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ErrorScreen } from './ErrorScreen'

const show = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('ErrorScreen', () => {
  it('says what happened and offers a way out as a link or a button', async () => {
    const onClick = vi.fn()
    show(
      <ErrorScreen eyebrow="404" title="We could not find that page" primary={{ label: 'See what is on', to: '/' }} secondary={{ label: 'Try again', onClick }}>
        <p>The link may be old.</p>
      </ErrorScreen>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('404')
    expect(screen.getByRole('heading', { level: 1, name: 'We could not find that page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See what is on' })).toHaveAttribute('href', '/')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps the technical facts behind "Details", with a reference to give support', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    show(<ErrorScreen eyebrow="Error 503" title="Down" details={{ status: 503, code: 'X', path: '/events/1' }} />)

    expect(screen.getByText('Status 503')).toBeInTheDocument()
    expect(screen.getByText('Page /events/1')).toBeInTheDocument()
    expect(screen.getByText(/^Reference TR-ERR-/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copy for support' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Status 503'))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
