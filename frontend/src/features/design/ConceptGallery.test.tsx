import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ConceptGallery, ConceptScreen } from './ConceptGallery'

function show(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/design-lab/concepts" element={<ConceptGallery />} /><Route path="/design-lab/concepts/:direction/:screen" element={<ConceptScreen />} /></Routes></MemoryRouter>)
}

describe('design concepts', () => {
  it('compares three distinct directions', () => {
    show('/design-lab/concepts')
    expect(screen.getByRole('heading', { name: 'Three ways to show up.' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Explore direction/ })).toHaveLength(3)
    expect(screen.getByText('Bricolage Grotesque')).toBeInTheDocument()
    expect(screen.getByText('Space Grotesk')).toBeInTheDocument()
    expect(screen.getByText('Syne')).toBeInTheDocument()
  })

  it.each([['city', 'Find something worth showing up for.'], ['after', 'Find your frequency.'], ['club', 'The night is yours.']])('shows %s discovery without prices', (direction, heading) => {
    show(`/design-lab/concepts/${direction}/discover`)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByText(/\$103\.20/)).not.toBeInTheDocument()
  })

  it('lets a guest try seats, validate checkout and preview a non-valid ticket', async () => {
    show('/design-lab/concepts/after/seats')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reduce motion' }))
    expect(screen.getByRole('button', { name: 'Enable motion' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Row 4, seat 31, selected' }))
    expect(screen.getByRole('heading', { name: '1 seat' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Review order' }))
    expect(screen.getByText('Total today')).toBeInTheDocument()
    expect(screen.getAllByText('$103.20')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Preview ticket' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address')
    await user.type(screen.getByRole('textbox', { name: 'Email for your tickets' }), 'demo@example.com')
    await user.click(screen.getByRole('button', { name: 'Preview ticket' }))
    expect(screen.getByRole('heading', { name: 'Your event, in hand.' })).toBeInTheDocument()
    expect(screen.getByText('Not valid for entry')).toBeInTheDocument()
  })
})
