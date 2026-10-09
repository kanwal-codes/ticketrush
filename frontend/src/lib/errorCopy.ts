import { ApiError } from '../api/errors'

export type Tone = 'error' | 'warning' | 'info' | 'success'

export type ErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'notFound' | 'rateLimited' | 'conflict' | 'invalid' | 'server' | 'unexpected'

export interface ErrorDescription {
  kind: ErrorKind
  tone: Tone
  title: string
  message: string
  /** What the guest can do about it, so a screen can offer the right button. */
  recovery: 'retry' | 'signin' | 'wait' | 'home' | 'rejoin' | 'none'
  /** For a rate limit: how long until it is worth trying again. */
  retryAfterSeconds?: number
  status?: number
  code?: string
}

/**
 * The words for every way a request can fail, in one place. Four rules: say what happened, say whether the guest's
 * place, seats or money are affected (only what is true for that failure), say what to do next, and never blame
 * the guest. `subject` names what was being loaded ("the events") so the title can say so.
 *
 * Payment outcomes have their own wording in features/checkout/pay.ts, because there the exact state of the money
 * is the whole point.
 */
export function describeError(error: unknown, subject?: string): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return {
      kind: 'unexpected',
      tone: 'error',
      title: 'Something unexpected happened',
      message: 'This is not something you did. Reloading usually puts it right, and anything you had already done is kept.',
      recovery: 'retry',
    }
  }

  const base = { status: error.status || undefined, code: error.code }

  if (error.isNetwork) {
    return {
      ...base,
      kind: 'network',
      tone: 'warning',
      title: 'No connection',
      message: 'We could not reach TicketRush. Check your connection. Your place in line and any seats you hold are kept while you are away.',
      recovery: 'retry',
    }
  }

  if (error.status === 401) {
    return {
      ...base,
      kind: 'unauthorized',
      tone: 'info',
      title: 'Please sign in again',
      message: 'Your session ended. Sign in and carry on where you were: your place in line and held seats are still yours.',
      recovery: 'signin',
    }
  }

  if (error.status === 403) {
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      return { ...base, kind: 'forbidden', tone: 'info', title: 'Confirm your email first', message: 'Open the link we emailed you, then try again. Nothing is lost: you can ask for a new link at the top of the page.', recovery: 'none' }
    }
    return error.code === 'ADMISSION_REQUIRED'
      ? { ...base, kind: 'forbidden', tone: 'info', title: 'Rejoin the queue', message: 'Your turn to choose seats has ended. Join the waiting room again to get back in.', recovery: 'rejoin' }
      : { ...base, kind: 'forbidden', tone: 'error', title: 'This is not yours to open', message: 'It belongs to another account. If you think that is wrong, sign in with the account you bought with.', recovery: 'home' }
  }

  if (error.status === 404) {
    return {
      ...base,
      kind: 'notFound',
      tone: 'error',
      title: 'We could not find that',
      message: 'The link may be old, or the event may have ended.',
      recovery: 'home',
    }
  }

  if (error.status === 429) {
    return {
      ...base,
      kind: 'rateLimited',
      tone: 'warning',
      title: 'Slow down a moment',
      message: 'You are going faster than we can keep up with. Nothing is lost: try again in a few seconds.',
      recovery: 'wait',
      retryAfterSeconds: error.retryAfterSeconds,
    }
  }

  if (error.status === 409) {
    // The server's own sentence for these is written for guests ("Your hold has expired. Pick your seats again.").
    return { ...base, kind: 'conflict', tone: 'warning', title: error.title || 'That did not work', message: error.message, recovery: 'none' }
  }

  if (error.status >= 500) {
    return {
      ...base,
      kind: 'server',
      tone: 'error',
      title: subject ? `We could not load ${subject}` : 'Something went wrong on our side',
      message: 'This is not something you did, and your place in line and held seats are safe. Try again in a moment.',
      recovery: 'retry',
    }
  }

  return { ...base, kind: 'invalid', tone: 'error', title: error.title || 'That did not work', message: error.message, recovery: 'none' }
}

/** What a person can copy to a support request: enough to find the failure, nothing private. */
export function supportReference(now: Date = new Date(), random: () => number = Math.random): string {
  const stamp = now.getTime().toString(36).toUpperCase().slice(-5)
  const noise = Math.floor(random() * 36 ** 3).toString(36).toUpperCase().padStart(3, '0')
  return `TR-ERR-${stamp}${noise}`
}
