import { useCallback, useEffect, useState } from 'react'

/** Counts down whole seconds after a rate limit, so a button can unlock itself exactly when trying again is worth it. */
export function useRetryCountdown(): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (remaining <= 0) return
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  return [remaining, useCallback((seconds: number) => setRemaining(Math.max(0, Math.ceil(seconds))), [])]
}
