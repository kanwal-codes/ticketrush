import { describe, expect, it } from 'vitest'
import { ApiError, networkError, problemToError } from '../api/errors'
import { describeError, supportReference } from './errorCopy'

const http = (status: number, problem: { title?: string; detail?: string; code?: string } = {}, retryAfter?: string) =>
  problemToError(status, problem, retryAfter)

describe('describeError', () => {
  it('says a lost connection is not the guest\'s fault and their place and seats are kept', () => {
    const d = describeError(networkError(new TypeError('Failed to fetch')))
    expect(d).toMatchObject({ kind: 'network', tone: 'warning', recovery: 'retry' })
    expect(d.message).toMatch(/place in line and any seats you hold are kept/)
  })

  it('asks the guest to sign in again, and says what they keep', () => {
    expect(describeError(http(401))).toMatchObject({ kind: 'unauthorized', recovery: 'signin' })
    expect(describeError(http(401)).message).toMatch(/still yours/)
  })

  it('tells a guest whose turn ended to rejoin the queue, and treats other forbidden answers differently', () => {
    expect(describeError(http(403, { code: 'ADMISSION_REQUIRED' }))).toMatchObject({ kind: 'forbidden', recovery: 'rejoin', title: 'Rejoin the queue' })
    expect(describeError(http(403))).toMatchObject({ kind: 'forbidden', recovery: 'home', tone: 'error' })
  })

  it('handles a missing page without blaming anyone', () => {
    expect(describeError(http(404, { detail: 'Event 9 not found' }))).toMatchObject({ kind: 'notFound', recovery: 'home', status: 404 })
  })

  it('carries how long to wait on a rate limit', () => {
    expect(describeError(http(429, { title: 'Slow down' }, '8'))).toMatchObject({ kind: 'rateLimited', recovery: 'wait', retryAfterSeconds: 8 })
    expect(describeError(http(429)).retryAfterSeconds).toBeUndefined()
  })

  it('uses the server\'s own words for a conflict, because they are written for guests', () => {
    const d = describeError(http(409, { title: 'Hold unavailable', detail: 'Your hold has expired. Pick your seats again.' }))
    expect(d).toMatchObject({ kind: 'conflict', title: 'Hold unavailable', message: 'Your hold has expired. Pick your seats again.' })
  })

  it('reassures about place and seats on a server fault, and names what failed to load', () => {
    expect(describeError(http(503), 'the events')).toMatchObject({ kind: 'server', title: 'We could not load the events', recovery: 'retry' })
    expect(describeError(http(500)).title).toBe('Something went wrong on our side')
    expect(describeError(http(500)).message).toMatch(/safe/)
  })

  it('does not promise anything about money, which only the payment screens can truthfully say', () => {
    const everything = [networkError(1), http(401), http(403), http(404), http(429), http(409), http(500), http(422), new Error('boom')].map((e) => describeError(e).message)
    for (const message of everything) expect(message).not.toMatch(/charged|refund|money/i)
  })

  it('covers a validation refusal and anything that is not an API error', () => {
    expect(describeError(http(422, { title: 'Idempotency key reused', detail: 'Used before' }))).toMatchObject({ kind: 'invalid', message: 'Used before' })
    expect(describeError(new Error('boom'))).toMatchObject({ kind: 'unexpected', recovery: 'retry' })
    expect(describeError('a string')).toMatchObject({ kind: 'unexpected' })
  })

  it('never blames the guest', () => {
    const blame = /you (should have|did something|made a mistake)|your fault|invalid input/i
    const all = [networkError(1), http(401), http(403), http(404), http(429), http(500), new ApiError({ kind: 'http', status: 418 }), new Error('x')]
    for (const e of all) expect(`${describeError(e).title} ${describeError(e).message}`).not.toMatch(blame)
  })
})

describe('supportReference', () => {
  it('makes a short code a person can read out', () => {
    expect(supportReference(new Date('2026-10-09T12:00:00Z'), () => 0.5)).toMatch(/^TR-ERR-[A-Z0-9]{8}$/)
  })

  it('differs between failures', () => {
    expect(supportReference(new Date(1), () => 0.1)).not.toBe(supportReference(new Date(2), () => 0.9))
  })
})
