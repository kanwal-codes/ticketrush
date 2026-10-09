import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../../api/errors'
import { Field } from '../../components/Field'
import { Notice } from '../../components/Notice'
import { Turnstile } from '../../components/Turnstile'
import { turnstileSiteKey } from '../../lib/turnstile'
import { useAfter } from '../../lib/useAfter'
import { describeError, type ErrorDescription } from '../../lib/errorCopy'
import { useRetryCountdown } from '../../lib/useRetryCountdown'
import { safeRedirect } from '../../auth/redirect'
import { useToken } from '../../auth/session'
import { useTitle } from '../../lib/useTitle'
import { register, signIn } from './api'
import { validate, type Mode, type Values } from './validate'
import './auth.css'

/** How long the sign-up bot check gets before the page says it is taking too long. */
const CHECK_PATIENCE_MS = 15_000

export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === 'register'
  useTitle(isRegister ? 'Create an account · TicketRush' : 'Sign in · TicketRush')
  const token = useToken()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeRedirect((location.state as { from?: string } | null)?.from)

  const [values, setValues] = useState<Values>({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const [formError, setFormError] = useState<Pick<ErrorDescription, 'tone' | 'title' | 'message'> | null>(null)
  const [waitSeconds, startWait] = useRetryCountdown()
  const [busy, setBusy] = useState(false)
  // The sign-up bot check, when the build has a site key: sign-up waits for its answer, and each answer is used once.
  const checked = isRegister && turnstileSiteKey() !== ''
  const [answer, setAnswer] = useState<string | null>(null)
  const [asks, setAsks] = useState(0)
  // If the check cannot run (an ad blocker, a strict network) or just takes long, say so instead of waiting silently.
  const [checkFailed, setCheckFailed] = useState(false)
  const [restarts, setRestarts] = useState(0)
  const slow = useAfter(CHECK_PATIENCE_MS, checked && answer === null && !checkFailed, `${asks}:${restarts}`)

  if (token && !busy) return <Navigate to={from} replace />

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problems = validate(mode, values)
    setErrors(problems)
    setFormError(null)
    if (Object.keys(problems).length > 0) return

    setBusy(true)
    try {
      if (isRegister) await register({ ...values, email: values.email.trim(), displayName: values.displayName.trim(), turnstileToken: answer ?? undefined })
      else await signIn(values.email.trim(), values.password)
      void navigate(from, { replace: true, viewTransition: true })
    } catch (error) {
      setBusy(false)
      if (checked) {
        setAnswer(null)
        setAsks((n) => n + 1)
      }
      if (error instanceof ApiError) {
        // The server's per-field messages go under the fields; a duplicate email belongs to the email field.
        const fields = { ...error.fieldErrors } as Partial<Record<keyof Values, string>>
        if (error.status === 409) fields.email = error.message
        if (Object.keys(fields).length > 0 && error.status !== 401) setErrors(fields)
        else if (error.status === 401) setFormError({ tone: 'error', title: 'That did not match', message: 'The email and password do not match an account. Check them and try again.' })
        else {
          const d = describeError(error)
          if (d.retryAfterSeconds) startWait(d.retryAfterSeconds)
          setFormError(d)
        }
      } else {
        setFormError(describeError(error))
      }
    }
  }

  return (
    <div className="page auth">
      <h1>{isRegister ? 'Create your account' : 'Sign in'}</h1>
      <p className="auth__lead">{isRegister ? 'You need an account to join a queue, hold seats and keep your tickets.' : 'Welcome back.'}</p>

      <form onSubmit={(e) => void submit(e)} noValidate className="auth__form">
        {isRegister && <Field label="Your name" value={values.displayName} onChange={set('displayName')} error={errors.displayName} autoComplete="name" maxLength={80} />}
        <Field label="Email" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" inputMode="email" />
        <Field
          label="Password"
          type="password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint={isRegister ? 'At least 8 characters.' : undefined}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
        />
        {!isRegister && (
          <p className="auth__forgot">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        )}
        {formError && (
          <Notice tone={formError.tone} title={formError.title} compact>
            {formError.message}
            {waitSeconds > 0 && <> You can try again in {waitSeconds} s.</>}
          </Notice>
        )}
        {checked && (
          <Turnstile
            key={restarts}
            onToken={(token) => {
              setAnswer(token)
              if (token) setCheckFailed(false)
            }}
            onError={() => setCheckFailed(true)}
            resetKey={asks}
          />
        )}
        {checked && answer === null && (checkFailed || slow) && (
          <Notice
            tone="warning"
            title={checkFailed ? 'We could not run the security check' : 'The security check is taking longer than usual'}
            compact
            actions={
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  setCheckFailed(false)
                  setRestarts((n) => n + 1)
                }}
              >
                Try the check again
              </button>
            }
          >
            An ad blocker, a strict network or a very old browser can get in the way. Turn blockers off for this site, reload the
            page or try another browser, then try again.
          </Notice>
        )}
        <button type="submit" className="btn auth__submit" disabled={busy || waitSeconds > 0 || (checked && answer === null)}>
          {busy ? 'One moment…' : waitSeconds > 0 ? `Try again in ${waitSeconds} s` : checked && answer === null ? 'Checking that you are a person…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="auth__switch">
        {isRegister ? (
          <>
            Already have an account? <Link to="/signin" state={location.state}>Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link to="/register" state={location.state}>Create an account</Link>
          </>
        )}
      </p>
    </div>
  )
}
