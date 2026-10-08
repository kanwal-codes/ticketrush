import createClient, { type Middleware } from 'openapi-fetch'
import { renewIfNeeded } from '../auth/renew'
import { clearToken, getToken } from '../auth/session'
import { reportReachable, reportUnreachable } from './connection'
import { networkError, problemToError, type Problem } from './errors'
import type { paths } from './schema'

/** Sends the sign-in token with every call and forgets it when the server says it is no longer good. */
const auth: Middleware = {
  async onRequest({ request }) {
    // Signing in, signing up and renewing are the ways to get a token, so none of them waits for one.
    if (!new URL(request.url).pathname.startsWith('/api/auth/')) await renewIfNeeded()
    const token = getToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  onResponse({ response }) {
    if (response.status === 401 && getToken()) clearToken()
    return response
  },
}

export function createApi(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  // The page's own origin: the dev server and nginx both forward /api to the backend, so there is no CORS.
  // Every call reports whether anything answered, which is how the page knows to say "we can't reach TicketRush".
  const watched: typeof fetch = async (...args) => {
    try {
      const response = await fetchImpl(...args)
      reportReachable()
      return response
    } catch (error) {
      reportUnreachable()
      throw error
    }
  }
  const client = createClient<paths>({ baseUrl: globalThis.location?.origin ?? '', fetch: watched })
  client.use(auth)
  return client
}

export const api = createApi()

interface Result<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Returns the data of a call, or throws an ApiError. A call that never got an answer is a network error. */
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await call
  } catch (cause) {
    throw networkError(cause)
  }
  if (!result.response.ok) {
    throw problemToError(result.response.status, result.error as Problem | undefined, result.response.headers.get('Retry-After'))
  }
  return result.data as T
}
