import { clearToken, getToken, setToken } from './session'

/** A token is renewed when it has less than this left, but only by someone who is still using the app. */
const RENEW_WITHIN_MS = 10 * 60_000

/**
 * The expiry a token states about itself. Read only to decide when to ask for a new one: whether the token is any good
 * is for the server to say, so a token that cannot be read is simply left alone.
 */
export function expiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

let renewing: Promise<void> | null = null

async function renew(token: string): Promise<void> {
  try {
    const response = await fetch(`${globalThis.location?.origin ?? ''}/api/auth/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (response.ok) {
      const body = (await response.json()) as { accessToken?: string }
      if (body.accessToken) setToken(body.accessToken)
    } else if (response.status === 401) {
      // The sign-in is too old to extend (or the account is gone): the person has to sign in again.
      clearToken()
    }
  } catch {
    // No answer. The current token is still good for a while, and the next request tries again.
  }
}

/**
 * Called before a request goes out. If the sign-in is about to run out, waits for one renewal (shared by every request
 * made in the meantime) so the request carries the new token. Idle tabs are not renewed, because nothing asks.
 */
export async function renewIfNeeded(): Promise<void> {
  const token = getToken()
  const exp = token ? expiresAt(token) : null
  if (!token || exp === null || exp - Date.now() > RENEW_WITHIN_MS) return
  renewing ??= renew(token).finally(() => {
    renewing = null
  })
  await renewing
}

/** Renews the token right now, whatever it has left. Used when something it says about the account has changed. */
export async function renewNow(): Promise<void> {
  const token = getToken()
  if (!token) return
  renewing ??= renew(token).finally(() => {
    renewing = null
  })
  await renewing
}
