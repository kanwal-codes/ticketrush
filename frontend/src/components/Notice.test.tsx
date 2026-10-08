import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Notice } from './Notice'

describe('Notice', () => {
  it('announces errors and warnings at once, and information politely', () => {
    const { rerender } = render(<Notice tone="error" title="Declined" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Declined')
    rerender(<Notice tone="warning" title="Slow down" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<Notice tone="info" title="Heads up" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(<Notice tone="success" title="Done" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the next step and can be dismissed', async () => {
    const onDismiss = vi.fn()
    render(
      <Notice title="Hold ended" actions={<button type="button">Choose again</button>} onDismiss={onDismiss}>
        The seats are back on sale.
      </Notice>,
    )
    expect(screen.getByText('The seats are back on sale.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose again' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
