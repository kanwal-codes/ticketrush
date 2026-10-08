import { describe, expect, it } from 'vitest'
import { ApiError, networkError, problemToError } from './errors'

describe('problemToError', () => {
  it('carries the title, detail and status of a problem response', () => {
    const error = problemToError(409, { title: 'Seats unavailable', detail: 'Some seats were just taken', unavailableSeatIds: [4, 9] })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.message).toBe('Some seats were just taken')
    expect(error.unavailableSeatIds).toEqual([4, 9])
    expect(error.isNetwork).toBe(false)
  })

  it('keeps per-field validation errors', () => {
    const error = problemToError(400, { detail: 'One or more fields are invalid', errors: { email: 'must be a valid email' } })
    expect(error.fieldErrors).toEqual({ email: 'must be a valid email' })
  })

  it('reads how long to wait from Retry-After', () => {
    expect(problemToError(429, { title: 'Slow down' }, '12').retryAfterSeconds).toBe(12)
    expect(problemToError(429, { title: 'Slow down' }, 'soon').retryAfterSeconds).toBeUndefined()
  })

  it('flags a 401 so the app can send the guest to sign in', () => {
    expect(problemToError(401, undefined).isUnauthorized).toBe(true)
    expect(problemToError(403, undefined).isUnauthorized).toBe(false)
  })

  it('copes with a response that has no body', () => {
    expect(problemToError(500, undefined).message).toBe('Something went wrong')
  })
})

describe('networkError', () => {
  it('is told apart from a refusal, because a lost request may have gone through', () => {
    const error = networkError(new TypeError('Failed to fetch'))
    expect(error.isNetwork).toBe(true)
    expect(error.status).toBe(0)
    expect(error.cause).toBeInstanceOf(TypeError)
  })
})
