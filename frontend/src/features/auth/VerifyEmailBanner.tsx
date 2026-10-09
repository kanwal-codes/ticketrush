import { useState } from 'react'
import { Notice } from '../../components/Notice'
import { describeError } from '../../lib/errorCopy'
import { resendVerification, useMe } from './api'

/** Shown to a signed-in guest whose address is not confirmed yet, with the way to get a new link. */
export function VerifyEmailBanner() {
  const me = useMe().data
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [problem, setProblem] = useState('')
  if (!me || me.emailVerified !== false) return null

  async function resend() {
    setState('sending')
    setProblem('')
    try {
      await resendVerification()
      setState('sent')
    } catch (caught) {
      setProblem(describeError(caught).message)
      setState('idle')
    }
  }

  return (
    <div className="verify-banner">
      <Notice
        tone="info"
        title="Confirm your email to join queues and buy tickets"
        compact
        actions={
          state === 'sent' ? undefined : (
            <button type="button" className="btn btn--quiet" onClick={() => void resend()} disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send the link again'}
            </button>
          )
        }
      >
        {state === 'sent' ? <>We sent a new link to {me.email}. It can take a few minutes: look in your spam folder too.</> : problem || <>We emailed a link to {me.email}.</>}
      </Notice>
    </div>
  )
}
