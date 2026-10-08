import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../../api/errors'
import { Field } from '../../components/Field'
import { safeRedirect } from '../../auth/redirect'
import { useToken } from '../../auth/session'
import { useTitle } from '../../lib/useTitle'
import { register, signIn } from './api'
import { validate, type Mode, type Values } from './validate'
import './auth.css'

export function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === 'register'
  useTitle(isRegister ? 'Create an account · TicketRush' : 'Sign in · TicketRush')
  const token = useToken()
  const navigate = useNavigate()
  const location = useLocation()
  const from = safeRedirect((location.state as { from?: string } | null)?.from)

  const [values, setValues] = useState<Values>({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const [formError, setFormError] = useState<ReactNode>(null)
  const [busy, setBusy] = useState(false)

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
      if (isRegister) await register({ ...values, email: values.email.trim(), displayName: values.displayName.trim() })
      else await signIn(values.email.trim(), values.password)
      void navigate(from, { replace: true })
    } catch (error) {
      setBusy(false)
      if (error instanceof ApiError) {
        // The server's per-field messages go under the fields; a duplicate email belongs to the email field.
        const fields = { ...error.fieldErrors } as Partial<Record<keyof Values, string>>
        if (error.status === 409) fields.email = error.message
        if (Object.keys(fields).length > 0 && error.status !== 401) setErrors(fields)
        else setFormError(error.isNetwork ? error.message : error.status === 401 ? 'That email and password do not match. Try again.' : error.message)
      } else {
        setFormError('Something went wrong. Try again.')
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
        {formError && (
          <p className="notice notice--error" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="btn auth__submit" disabled={busy}>
          {busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
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
