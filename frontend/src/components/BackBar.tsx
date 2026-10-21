import type { ReactNode } from 'react'
import { Link } from 'react-router'
import './backbar.css'

/**
 * The way back one step, kept in view under the header while the page scrolls, so a long page never leaves the guest
 * with nowhere to go. Every step of the purchase uses it.
 */
export function BackBar({ to, children, shortLabel }: { to: string; children: ReactNode; shortLabel?: string }) {
  return (
    <nav className="backbar" aria-label="Back">
      <Link to={to} className="backbar__link" aria-label={shortLabel && typeof children === 'string' ? children : undefined} viewTransition>
        <svg className="backbar__arrow" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M16 10H4M9 5l-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
        <span className={shortLabel ? 'backbar__full' : undefined}>{children}</span>
        {shortLabel && <span className="backbar__short" aria-hidden="true">{shortLabel}</span>}
      </Link>
    </nav>
  )
}
