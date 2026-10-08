import { useSyncExternalStore } from 'react'
import { serverNow } from '../../lib/time'

/**
 * The guest's current hold, remembered for the whole tab so the timer in the nav can follow them from page to
 * page. The server is the source of truth (a hold is looked up again on the seat page); this is only so the
 * timer and the way back to checkout are always at hand.
 */
export interface ActiveHold {
  holdId: number
  eventId: number
  /** ISO timestamp, on the server's clock. */
  expiresAt: string
}

const KEY = 'tr.hold'
const listeners = new Set<() => void>()
let snapshot: string | null | undefined

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

const emit = () => {
  snapshot = read()
  listeners.forEach((l) => l())
}

export function setActiveHold(hold: ActiveHold): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(hold))
  } catch {
    // Without storage the timer simply will not follow the guest to other pages.
  }
  emit()
}

export function clearActiveHold(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
  emit()
}

export function parseActiveHold(raw: string | null): ActiveHold | null {
  if (!raw) return null
  try {
    const hold = JSON.parse(raw) as Partial<ActiveHold>
    return typeof hold.holdId === 'number' && typeof hold.eventId === 'number' && typeof hold.expiresAt === 'string' ? (hold as ActiveHold) : null
  } catch {
    return null
  }
}

/** The hold, unless it has already run out. */
export function getActiveHold(): ActiveHold | null {
  const hold = parseActiveHold(read())
  return hold && Date.parse(hold.expiresAt) > serverNow() ? hold : null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A string snapshot, so useSyncExternalStore sees a stable value until the hold actually changes. */
export function useActiveHold(): ActiveHold | null {
  const raw = useSyncExternalStore(subscribe, () => (snapshot === undefined ? (snapshot = read()) : snapshot), () => null)
  return parseActiveHold(raw)
}
