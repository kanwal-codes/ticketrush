import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/errors'
import { shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it('retries a lost connection and a server error, but only twice', () => {
    const lost = new ApiError({ kind: 'network' })
    const broken = new ApiError({ kind: 'http', status: 503 })
    expect(shouldRetry(0, lost)).toBe(true)
    expect(shouldRetry(1, broken)).toBe(true)
    expect(shouldRetry(2, lost)).toBe(false)
  })

  it('never retries a refusal', () => {
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 404 }))).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 409 }))).toBe(false)
  })
})
