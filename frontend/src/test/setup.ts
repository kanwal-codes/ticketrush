import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { resetConnection } from '../api/connection'

// jsdom cannot scroll; page changes ask it to.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo

afterEach(() => {
  cleanup()
  resetConnection()
  sessionStorage.clear()
})
