import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneyPrototype } from './JourneyPrototype'

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()))

describe('JourneyPrototype', () => {
  it('carries a poster theme and selected-seat total through the demo journey', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/design-lab']}><JourneyPrototype /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /Find your.*next night/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Explore Blue Room Sessions' }))
    expect(screen.getByRole('heading', { name: 'Blue Room Sessions' })).toBeInTheDocument()
    expect(document.querySelector('.jp')).toHaveStyle('--jp-accent: #8a5a1f')

    await user.click(screen.getByRole('button', { name: 'Find tickets' }))
    await user.click(screen.getByRole('button', { name: 'Continue to seats' }))
    await user.click(screen.getByRole('button', { name: 'Row 4, seat 31' }))
    expect(screen.getByRole('button', { name: 'Row 4, seat 31, selected' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('$72.76', { selector: '.jp-summary__total strong' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review order' }))
    await user.click(screen.getByRole('button', { name: 'Complete demo purchase' }))
    expect(screen.getByText('Enter a valid email address to continue.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email for your tickets' })).toHaveFocus()
    await user.type(screen.getByRole('textbox', { name: 'Email for your tickets' }), 'demo@example.com')
    await user.click(screen.getByRole('button', { name: 'Complete demo purchase' }))
    expect(screen.getByRole('heading', { name: 'The night is yours.' })).toBeInTheDocument()
    expect(screen.getByText('DESIGN PREVIEW / NOT VALID FOR ENTRY')).toBeInTheDocument()
  })

  it('switches poster palettes without retaining the previous event seats', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/design-lab?event=aurora&step=seats&seats=31']}><JourneyPrototype /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '1 seat' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Blue Room Sessions' }))
    expect(screen.getByRole('heading', { name: 'Blue Room Sessions' })).toBeInTheDocument()
    expect(document.querySelector('.jp')).toHaveStyle('--jp-accent: #8a5a1f')
    await user.click(screen.getByRole('button', { name: 'Seats' }))
    expect(screen.getByRole('heading', { name: 'Your seats' })).toBeInTheDocument()
  })
})
