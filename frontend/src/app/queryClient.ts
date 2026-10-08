import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/errors'

/** Retry what might work next time (no connection, a server hiccup). Never retry a refusal: asking again changes nothing. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof ApiError) return error.isNetwork || error.status >= 500
  return true
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 15_000 },
      mutations: { retry: false },
    },
  })
}
