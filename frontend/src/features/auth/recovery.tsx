import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../../api/errors'
import { Field } from '../../components/Field'
import { Notice } from '../../components/Notice'
import { renewNow } from '../../auth/renew'
import { getToken } from '../../auth/session'
import { describeError } from '../../lib/errorCopy'
import { useTitle } from '../../lib/useTitle'
import { forgotPassword, meKey, resetPassword, verifyEmail } from './api'
import './auth.css'

/** Step one of a forgotten password: ask for the link. The answer never says whether the address has an account. */
export function ForgotPassword() {
  useTitle('Forgot your password · TicketRush')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('That does not look like an email address')
      return
    }
    setError('')
    setBusy(true)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (failure) {
      setError(describeError(failure).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page auth">
      <h1>Forgot your password?</h1>
      {sent ? (
        <Notice tone="success" title="Check your email">
          If {email.trim()} has an account, we have sent a link to choose a new password. It works for an hour. It can take a few minutes to arrive: look in your spam folder too.
        </Notice>
      ) : (
        <>
          <p className="auth__lead">Enter the email you signed up with and we will send you a link to choose a new one.</p>
          <form onSubmit={(e) => void submit(e)} noValidate className="auth__form">
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoComplete="email" inputMode="email" />
            <button type="submit" className="btn auth__submit" disabled={busy}>
              {busy ? 'One moment…' : 'Send the link'}
            </button>
          </form>
        </>
      )}
      <p className="auth__switch">
        <Link to="/signin">Back to sign in</Link>
      </p>
    </div>
  )
}

/** Step two: the link in the email lands here with its secret in the address. */
export function ResetPassword() {
  useTitle('Choose a new password · TicketRush')
  const token = useSearchParams()[0].get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFailure(null)
    if (password.length < 8) {
      setError('Use at least 8 characters')
      return
    }
    setError('')
    setBusy(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 400 && caught.fieldErrors.password) setError(caught.fieldErrors.password)
      else setFailure(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!token) return <LinkProblem message="This page needs the link from your email. Open the link again, or ask for a new one." />
  if (done) {
    return (
      <div className="page auth">
        <h1>Password changed</h1>
        <Notice tone="success" title="You can sign in with your new password">
          Anyone who was signed in on another device will need to sign in again soon.
        </Notice>
        <p className="auth__switch">
          <Link to="/signin" className="btn">Sign in</Link>
        </p>
      </div>
    )
  }
  return (
    <div className="page auth">
      <h1>Choose a new password</h1>
      <form onSubmit={(e) => void submit(e)} noValidate className="auth__form">
        <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} hint="At least 8 characters." autoComplete="new-password" />
        {failure && (
          <Notice tone="error" title={failure.title} compact actions={<Link to="/forgot-password">Ask for a new link</Link>}>
            {failure.message}
          </Notice>
        )}
        <button type="submit" className="btn auth__submit" disabled={busy}>
          {busy ? 'One moment…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

/** The link in the confirmation email lands here and is used straight away. */
export function VerifyEmail() {
  useTitle('Confirm your email · TicketRush')
  const token = useSearchParams()[0].get('token') ?? ''
  const queryClient = useQueryClient()
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed')
  const [message, setMessage] = useState('This page needs the link from your email. Open the link again.')
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verifyEmail(token)
      .then(async () => {
        // A signed-in guest's token still says "not confirmed": renew it so the next queue join goes through.
        if (getToken()) {
          await renewNow()
          await queryClient.invalidateQueries({ queryKey: meKey })
        }
        setState('done')
      })
      .catch((caught: unknown) => {
        setMessage(describeError(caught).message)
        setState('failed')
      })
  }, [token, queryClient])

  if (state === 'failed') return <LinkProblem message={message} />
  return (
    <div className="page auth">
      <h1>{state === 'done' ? 'Email confirmed' : 'Confirming your email…'}</h1>
      {state === 'done' && (
        <>
          <Notice tone="success" title="You are all set">
            You can now join queues, hold seats and buy tickets.
          </Notice>
          <p className="auth__switch">
            <Link to="/" className="btn">Browse events</Link>
          </p>
        </>
      )}
    </div>
  )
}

function LinkProblem({ message }: { message: string }) {
  return (
    <div className="page auth">
      <h1>This link did not work</h1>
      <Notice tone="warning" title="It may have expired or been used already">
        {message}
      </Notice>
      <p className="auth__switch">
        <Link to="/signin">Sign in</Link> and ask for a new confirmation link, or <Link to="/forgot-password">reset your password</Link>.
      </p>
    </div>
  )
}
