/** What the backend sends for a refused request (RFC 7807), plus the few extra fields it adds. */
export interface Problem {
  title?: string
  detail?: string
  status?: number
  code?: string
  errors?: Record<string, string>
  unavailableSeatIds?: number[]
}

/**
 * The one error type the app deals with. `kind` separates "the server said no" from "we never heard back",
 * which matter differently when money is involved: a refused request is final, a lost one may have succeeded.
 */
export class ApiError extends Error {
  readonly kind: 'http' | 'network'
  readonly status: number
  readonly title: string
  readonly code?: string
  readonly fieldErrors: Record<string, string>
  readonly unavailableSeatIds: number[]
  readonly retryAfterSeconds?: number

  constructor(init: {
    kind: 'http' | 'network'
    status?: number
    title?: string
    detail?: string
    code?: string
    fieldErrors?: Record<string, string>
    unavailableSeatIds?: number[]
    retryAfterSeconds?: number
  }) {
    super(init.detail ?? init.title ?? 'Something went wrong')
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status ?? 0
    this.title = init.title ?? ''
    this.code = init.code
    this.fieldErrors = init.fieldErrors ?? {}
    this.unavailableSeatIds = init.unavailableSeatIds ?? []
    this.retryAfterSeconds = init.retryAfterSeconds
  }

  get isNetwork(): boolean {
    return this.kind === 'network'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

export function problemToError(status: number, problem: Problem | undefined, retryAfter?: string | null): ApiError {
  const seconds = retryAfter ? Number(retryAfter) : NaN
  return new ApiError({
    kind: 'http',
    status,
    title: problem?.title,
    detail: problem?.detail,
    code: problem?.code,
    fieldErrors: problem?.errors,
    unavailableSeatIds: problem?.unavailableSeatIds,
    retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
  })
}

export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    kind: 'network',
    title: 'No connection',
    detail: 'We could not reach the server. Check your connection and try again.',
  })
  error.cause = cause
  return error
}
