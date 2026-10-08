import { describe, expect, it, vi } from 'vitest'
import { clearToken, getToken, setToken } from '../auth/session'
import { createApi, unwrap } from './client'
import { ApiError } from './errors'

function sentRequest(fetchImpl: { mock: { calls: unknown[][] } }): Request {
  const request = fetchImpl.mock.calls[0]?.[0]
  if (!(request instanceof Request)) throw new Error('no request was sent')
  return request
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

describe('api client', () => {
  it('sends the sign-in token as a bearer header', async () => {
    setToken('tok123')
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, []))
    await createApi(fetchImpl).GET('/api/tickets')
    expect(sentRequest(fetchImpl).headers.get('Authorization')).toBe('Bearer tok123')
  })

  it('sends nothing when signed out', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, []))
    await createApi(fetchImpl).GET('/api/tickets')
    expect(sentRequest(fetchImpl).headers.has('Authorization')).toBe(false)
  })

  it('forgets the token when the server answers 401', async () => {
    setToken('expired')
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, { title: 'Unauthorized' }))
    await createApi(fetchImpl).GET('/api/me')
    expect(getToken()).toBeNull()
  })

  it('turns a refusal into an ApiError with the problem details', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(429, { title: 'Slow down', detail: 'Too many requests' }, { 'Retry-After': '7' }))
    const call = createApi(fetchImpl).GET('/api/tickets')
    await expect(unwrap(call)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 7, message: 'Too many requests' })
  })

  it('turns a request that never got an answer into a network error', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await unwrap(createApi(fetchImpl).GET('/api/tickets')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isNetwork).toBe(true)
  })

  it('returns the data on success', async () => {
    clearToken()
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, [{ id: 1 }]))
    await expect(unwrap(createApi(fetchImpl).GET('/api/tickets'))).resolves.toEqual([{ id: 1 }])
  })
})
