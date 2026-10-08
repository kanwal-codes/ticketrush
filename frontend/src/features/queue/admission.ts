import { serverNow } from '../../lib/time'

/**
 * Being let in produces a token that the hold request must carry. It is kept per event for as long as it is
 * valid, so a refresh on the seat page does not send the guest back to the queue.
 */
const key = (eventId: number) => `tr.admission.${eventId}`
const FALLBACK_MS = 5 * 60_000

interface Stored {
  token: string
  until: number
}

export function saveAdmission(eventId: number, token: string, untilIso: string | null | undefined): void {
  const parsed = untilIso ? Date.parse(untilIso) : NaN
  const stored: Stored = { token, until: Number.isFinite(parsed) ? parsed : serverNow() + FALLBACK_MS }
  try {
    sessionStorage.setItem(key(eventId), JSON.stringify(stored))
  } catch {
    // Storage blocked: the guest keeps the token for this visit only.
  }
}

/** The token if it is still valid, else nothing (and it is forgotten). */
export function getAdmission(eventId: number): string | null {
  try {
    const raw = sessionStorage.getItem(key(eventId))
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    if (stored.until > serverNow()) return stored.token
    sessionStorage.removeItem(key(eventId))
  } catch {
    // fall through
  }
  return null
}

export function clearAdmission(eventId: number): void {
  try {
    sessionStorage.removeItem(key(eventId))
  } catch {
    // nothing to clear
  }
}
