import { useSyncExternalStore } from 'react'

const KEY = 'tr.token'
const listeners = new Set<() => void>()

/**
 * The sign-in token lives in sessionStorage: it survives a refresh but is gone when the tab closes. The cost of
 * that choice (any script on the page could read it) is written up in the decision record.
 */
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  sessionStorage.setItem(KEY, token)
  listeners.forEach((l) => l())
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, () => null)
}
