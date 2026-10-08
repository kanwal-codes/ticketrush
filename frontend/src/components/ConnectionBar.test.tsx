import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReachable, reportUnreachable } from '../api/connection'
import { ConnectionBar } from './ConnectionBar'

describe('ConnectionBar', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says nothing while all is well', () => {
    render(<ConnectionBar />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says the browser is offline, that nothing is lost, and then that it is back', () => {
    render(<ConnectionBar />)
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toHaveTextContent('You are offline.')
    expect(screen.getByRole('status')).toHaveTextContent('place in line')

    act(() => void window.dispatchEvent(new Event('online')))
    expect(screen.getByRole('status')).toHaveTextContent('You are back online.')

    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('tells "we cannot reach you" apart from "you are offline"', () => {
    render(<ConnectionBar />)
    act(() => reportUnreachable())
    expect(screen.getByRole('status')).toHaveTextContent('We cannot reach TicketRush')
    act(() => reportReachable())
    expect(screen.getByRole('status')).toHaveTextContent('back online')
  })
})
