import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../api/client'
import { json, mockApi } from '../test/mockApi'
import { expiresAt } from './renew'
import { getToken, setToken } from './session'

/** A token as the server makes them, signature and all not mattering: only the payload's exp is read. */
const token = (expiresInSeconds: number) => {
  const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${part({ alg: 'HS256' })}.${part({ sub: '1', exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.sig`
}

beforeEach(() => sessionStorage.clear())

describe('expiresAt', () => {
  it('reads the expiry a token states, and shrugs at anything that is not one', () => {
    expect(expiresAt(token(60))).toBeGreaterThan(Date.now())
    for (const bad of ['abc', 'a.b.c', 'a..c', '']) expect(expiresAt(bad)).toBeNull()
  })
})

describe('renewing a sign-in that is in use', () => {
  it('swaps in a new token before a request when the old one is nearly out, once for several requests', async () => {
    const fresh = token(1800)
    setToken(token(120))
    const { calls } = mockApi({
      'POST /api/auth/refresh': () => json({ accessToken: fresh, tokenType: 'Bearer', expiresIn: 1800 }),
      'GET /api/me': () => json({ id: 1 }),
    })

    await Promise.all([api.GET('/api/me'), api.GET('/api/me'), api.GET('/api/me')])

    expect(calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(1)
    expect(getToken()).toBe(fresh)
    for (const call of calls.filter((c) => c.url.endsWith('/api/me'))) expect(call.headers.get('Authorization')).toBe(`Bearer ${fresh}`)
  })

  it('leaves a token with plenty of time, and one that is not readable, alone', async () => {
    const good = token(3600)
    setToken(good)
    const { calls } = mockApi({ 'GET /api/me': () => json({ id: 1 }) })
    await api.GET('/api/me')
    expect(calls).toHaveLength(1)
    expect(getToken()).toBe(good)

    setToken('abc')
    await api.GET('/api/me')
    expect(getToken()).toBe('abc')
  })

  it('signs the person out when the sign-in is too old to extend', async () => {
    setToken(token(60))
    mockApi({ 'POST /api/auth/refresh': () => json({ title: 'Session ended' }, 401), 'GET /api/me': () => json({ title: 'No' }, 401) })
    await api.GET('/api/me')
    expect(getToken()).toBeNull()
  })

  it('carries on with the old token when the renewal gets no answer', async () => {
    const old = token(60)
    setToken(old)
    const { calls } = mockApi({
      'POST /api/auth/refresh': () => {
        throw new TypeError('network down')
      },
      'GET /api/me': () => json({ id: 1 }),
    })
    const result = await api.GET('/api/me')
    expect(result.response.status).toBe(200)
    expect(calls.find((c) => c.url.endsWith('/api/me'))!.headers.get('Authorization')).toBe(`Bearer ${old}`)
  })

  it('does not wait for a renewal to sign in', async () => {
    setToken(token(60))
    const { calls } = mockApi({ 'POST /api/auth/login': () => json({ accessToken: 'x', tokenType: 'Bearer', expiresIn: 1 }) })
    await api.POST('/api/auth/login', { body: { email: 'a@b.co', password: 'pw' } })
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/api/auth/login'])
  })
})
