import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, unwrap } from '../../api/client'
import { Field } from '../../components/Field'
import { Notice } from '../../components/Notice'
import { clearToken } from '../../auth/session'
import { describeError } from '../../lib/errorCopy'
import { useTitle } from '../../lib/useTitle'
import { useMe } from '../auth/api'
import './account.css'

/** Hands the browser a file made from JSON, as a download. */
function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AccountPage() {
  useTitle('Your account · TicketRush')
  const me = useMe().data
  const navigate = useNavigate()

  const [exporting, setExporting] = useState(false)
  const [exportProblem, setExportProblem] = useState('')
  const [password, setPassword] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeProblem, setCloseProblem] = useState<{ title: string; message: string } | null>(null)

  async function exportData() {
    setExporting(true)
    setExportProblem('')
    try {
      download('ticketrush-my-data.json', await unwrap(api.GET('/api/me/export')))
    } catch (failure) {
      setExportProblem(describeError(failure).message)
    } finally {
      setExporting(false)
    }
  }

  async function closeAccount(e: FormEvent) {
    e.preventDefault()
    if (!password) {
      setCloseProblem({ title: 'Enter your password', message: 'We ask for it again because closing an account cannot be undone.' })
      return
    }
    setClosing(true)
    setCloseProblem(null)
    try {
      await unwrap(api.POST('/api/me/close', { body: { password } }))
      // Signing out here would send this page to the sign-in screen before it could leave: the goodbye page does it.
      void navigate('/goodbye', { replace: true, state: { closed: true } })
    } catch (failure) {
      const d = describeError(failure)
      setCloseProblem({ title: d.title, message: d.message })
      setClosing(false)
    }
  }

  return (
    <div className="page account">
      <h1>Your account</h1>
      {me && (
        <p>
          {me.displayName}, {me.email}
        </p>
      )}

      <section aria-labelledby="export-heading">
        <h2 id="export-heading">Your data</h2>
        <p>Download everything we keep about you (your account, your orders and tickets, and the messages we sent) as one file.</p>
        <button type="button" className="btn btn--quiet" onClick={() => void exportData()} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download my data'}
        </button>
        {exportProblem && (
          <Notice tone="error" title="We could not prepare your data" compact>
            {exportProblem}
          </Notice>
        )}
      </section>

      <section aria-labelledby="close-heading">
        <h2 id="close-heading">Close your account</h2>
        <div className="account__danger">
          <p>
            This removes your name and email address and signs you out. Order and ticket records stay, without your name or address, so
            the organizer&apos;s sales add up. You cannot undo it, and you can only close once any ticket for an event still to come has been used or refunded.
          </p>
          <form onSubmit={(e) => void closeAccount(e)} noValidate aria-label="Close your account">
            <Field label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            {closeProblem && (
              <Notice tone="error" title={closeProblem.title} compact>
                {closeProblem.message}
              </Notice>
            )}
            <button type="submit" className="btn" disabled={closing}>
              {closing ? 'Closing…' : 'Close my account'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

export function Goodbye() {
  useTitle('Account closed · TicketRush')
  const queryClient = useQueryClient()
  const closed = (useLocation().state as { closed?: boolean } | null)?.closed === true
  useEffect(() => {
    if (!closed) return
    clearToken()
    queryClient.clear()
  }, [closed, queryClient])
  return (
    <div className="page account">
      <h1>Your account is closed</h1>
      <Notice tone="success" title="Your name and email address have been removed">
        You have been signed out. Thank you for trying TicketRush.
      </Notice>
    </div>
  )
}
