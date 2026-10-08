import type { ReactNode } from 'react'
import type { Tone } from '../lib/errorCopy'
import { Icon } from './Icon'
import './notice.css'

interface Props {
  tone?: Tone
  title: string
  children?: ReactNode
  /** Buttons or links: the next step. */
  actions?: ReactNode
  onDismiss?: () => void
  /** Smaller, for use inside a panel or beside a form. */
  compact?: boolean
}

/**
 * A message about what just happened, where it happened. Errors and warnings are announced at once (role alert);
 * information and good news wait their turn (role status). It slides in, and an error shakes once so the eye goes there.
 */
export function Notice({ tone = 'error', title, children, actions, onDismiss, compact }: Props) {
  return (
    <div className={`notice notice--${tone}${compact ? ' notice--compact' : ''}`} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
      <span className="notice__icon">
        <Icon name={tone} size={compact ? 18 : 22} />
      </span>
      <div className="notice__body">
        <p className="notice__title">{title}</p>
        {children && <div className="notice__text">{children}</div>}
        {actions && <div className="notice__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="notice__close" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  )
}
