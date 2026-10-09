import { useEffect, useState } from 'react'

/**
 * True once {@code ms} have passed since {@code active} became true for this {@code key}. Changing the key starts the
 * count again, so "try again" gets a fresh wait. Nothing is set while it is not active.
 */
export function useAfter(ms: number, active: boolean, key: unknown): boolean {
  const [elapsedFor, setElapsedFor] = useState<unknown>(null)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setElapsedFor(key), ms)
    return () => clearTimeout(timer)
  }, [ms, active, key])
  return active && elapsedFor === key
}
