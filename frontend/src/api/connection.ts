import { useSyncExternalStore } from 'react'

/**
 * Whether the guest can reach us. Two different troubles look alike from the page: the browser has no network at all
 * ("offline"), or it has one but our server does not answer ("unreachable"). Either way the guest needs to know their
 * place and seats are kept, and to be told when it comes back.
 */
export interface Connection {
  offline: boolean
  unreachable: boolean
}

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
let state: Connection = { offline: !online(), unreachable: false }
const listeners = new Set<() => void>()

function set(next: Connection) {
  if (next.offline === state.offline && next.unreachable === state.unreachable) return
  state = next
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set({ ...state, offline: true }))
  window.addEventListener('online', () => set({ offline: false, unreachable: false }))
}

/** Any answer at all, even an error, means the server is there. */
export const reportReachable = () => set({ ...state, unreachable: false })

/** A request that got no answer while the browser thinks it has a network. */
export const reportUnreachable = () => set({ ...state, unreachable: !state.offline })

/** For tests. */
export function resetConnection() {
  state = { offline: false, unreachable: false }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export const useConnection = (): Connection => useSyncExternalStore(subscribe, () => state, () => state)
