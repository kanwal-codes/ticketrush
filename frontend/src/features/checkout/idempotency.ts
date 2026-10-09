/**
 * Paying twice by accident is the one mistake that cannot be undone, so the rule for the Idempotency-Key is
 * written down here and tested:
 *
 * - The same attempt, retried, sends the same key. If a payment request got no answer (connection dropped, a
 *   server error, "still pending") we cannot know whether the card was charged. Sending the same key makes the
 *   retry safe: the server answers with what already happened instead of charging again.
 * - A different card is a different attempt, so it gets a new key.
 * - Once the server has given a final answer (paid, declined, refunded) the attempt is over, and the next try is
 *   a new one.
 *
 * The key is kept for the tab, so a refresh in the middle of a payment still retries the same attempt.
 */
const storageKey = (holdId: number) => `tr.idem.${holdId}`

interface Stored {
  token: string
  key: string
}

const newKey = () => `tr-${crypto.randomUUID()}`

/** The key to use for paying this hold with this card token. */
export function keyFor(holdId: number, cardToken: string): string {
  try {
    const raw = sessionStorage.getItem(storageKey(holdId))
    if (raw) {
      const stored = JSON.parse(raw) as Stored
      if (stored.token === cardToken && typeof stored.key === 'string') return stored.key
    }
    const fresh: Stored = { token: cardToken, key: newKey() }
    sessionStorage.setItem(storageKey(holdId), JSON.stringify(fresh))
    return fresh.key
  } catch {
    // Storage blocked: the key still holds for this call, which is what matters within one attempt.
    return newKey()
  }
}

/** The attempt is over (the server gave a final answer). The next payment for this hold starts afresh. */
export function endAttempt(holdId: number): void {
  try {
    sessionStorage.removeItem(storageKey(holdId))
  } catch {
    // nothing to clear
  }
}

/** The card token of an attempt that is still open, so a retry after "we could not confirm" sends the very same one. */
export function currentToken(holdId: number): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey(holdId))
    return raw ? (JSON.parse(raw) as Stored).token : null
  } catch {
    return null
  }
}
