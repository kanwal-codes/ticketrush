import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { supportReference, type ErrorDescription } from '../lib/errorCopy'
import './errorScreen.css'

/** A next step: a client route, a plain link (works even when the app itself has crashed), or a button. */
export interface ErrorAction {
  label: string
  to?: string
  href?: string
  onClick?: () => void
}

interface Props {
  /** Small label above the headline, e.g. "404" or "Offline". */
  eyebrow: string
  title: string
  children?: ReactNode
  primary?: ErrorAction
  secondary?: ErrorAction
  /** Technical facts, tucked behind "Details" so support can be given a reference. */
  details?: Pick<ErrorDescription, 'status' | 'code'> & { path?: string }
}

function Action({ action, quiet }: { action: ErrorAction; quiet?: boolean }) {
  const className = quiet ? 'btn btn--quiet' : 'btn'
  if (action.to) return <Link className={className} to={action.to}>{action.label}</Link>
  if (action.href) return <a className={className} href={action.href}>{action.label}</a>
  return <button type="button" className={className} onClick={action.onClick}>{action.label}</button>
}

/** A torn ticket stub: the brand's way of saying "this didn't go through" without a sad face. */
function Stub() {
  return (
    <svg className="error-screen__stub" viewBox="0 0 160 96" aria-hidden="true" focusable="false">
      <path className="error-screen__half" d="M4 8h84l-6 10 8 10-8 10 8 10-8 10 8 10-8 10 6 10H4z" />
      <path className="error-screen__half error-screen__half--right" d="M104 8h52v80h-52l-6-10 8-10-8-10 8-10-8-10 8-10-8-10z" />
      <path className="error-screen__rule" d="M16 30h52M16 46h40M16 62h48" />
    </svg>
  )
}

/**
 * The page a guest sees when a whole screen cannot be shown. Calm, specific, with a way out. The reference is made
 * once per screen, so what a guest reads out to support matches what they were looking at.
 */
export function ErrorScreen({ eyebrow, title, children, primary, secondary, details }: Props) {
  const [seen] = useState(() => ({ reference: supportReference(), at: new Date().toISOString() }))
  const [copied, setCopied] = useState(false)
  const facts = [
    details?.status ? `Status ${details.status}` : '',
    details?.code ? `Code ${details.code}` : '',
    details?.path ? `Page ${details.path}` : '',
    `Time ${seen.at}`,
    `Reference ${seen.reference}`,
  ].filter(Boolean)

  async function copy() {
    try {
      await navigator.clipboard.writeText(facts.join('\n'))
      setCopied(true)
    } catch {
      // Clipboard can be refused; the facts are on screen to read out.
    }
  }

  return (
    <div className="page error-screen" role="alert">
      <Stub />
      <p className="label">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="error-screen__text">{children}</div>}
      {(primary || secondary) && (
        <p className="error-screen__actions">
          {primary && <Action action={primary} />}
          {secondary && <Action action={secondary} quiet />}
        </p>
      )}
      <details className="error-screen__details">
        <summary>Details</summary>
        <ul>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <button type="button" className="btn btn--quiet" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy for support'}
        </button>
      </details>
    </div>
  )
}
