import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Fire({ title = 'Seats released', duration }: { title?: string; duration?: number }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast({ tone: 'success', title, duration })}>
      fire {title}
    </button>
  )
}

const setup = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>)

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('appears in a polite region and goes away by itself', async () => {
    setup(<Fire />)
    await userEvent.click(screen.getByRole('button', { name: /fire/ }))
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveTextContent('Seats released')

    act(() => void vi.advanceTimersByTime(5000))
    act(() => void vi.advanceTimersByTime(250)) // it fades out before it is removed
    expect(screen.queryByText('Seats released')).not.toBeInTheDocument()
  })

  it('stays while the pointer is on it and picks up where it left off', async () => {
    setup(<Fire />)
    await userEvent.click(screen.getByRole('button', { name: /fire/ }))
    const toast = screen.getByText('Seats released').closest('.toast') as HTMLElement

    act(() => void vi.advanceTimersByTime(3000))
    await userEvent.hover(toast)
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByText('Seats released')).toBeInTheDocument()

    await userEvent.unhover(toast)
    act(() => void vi.advanceTimersByTime(2000))
    act(() => void vi.advanceTimersByTime(250))
    expect(screen.queryByText('Seats released')).not.toBeInTheDocument()
  })

  it('shows at most three at once, dropping the oldest', async () => {
    function Burst() {
      const toast = useToast()
      return (
        <button type="button" onClick={() => ['one', 'two', 'three', 'four'].forEach((title) => toast({ title }))}>
          burst
        </button>
      )
    }
    setup(<Burst />)
    await userEvent.click(screen.getByRole('button', { name: 'burst' }))
    expect(screen.queryByText('one')).not.toBeInTheDocument()
    expect(screen.getByText('four')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3)
  })

  it('can be dismissed', async () => {
    setup(<Fire />)
    await userEvent.click(screen.getByRole('button', { name: /fire/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => void vi.advanceTimersByTime(250))
    expect(screen.queryByText('Seats released')).not.toBeInTheDocument()
  })
})
