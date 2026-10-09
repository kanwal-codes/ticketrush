import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { clearToken, useToken } from '../auth/session'
import { useMe } from '../features/auth/api'
import { VerifyEmailBanner } from '../features/auth/VerifyEmailBanner'
import { ConnectionBar } from '../components/ConnectionBar'
import { HoldTimer } from '../features/seats/HoldTimer'
import { RouteEffects } from './RouteEffects'
import './layout.css'

export function Layout() {
  const token = useToken()
  const queryClient = useQueryClient()
  const me = useMe().data
  const header = useRef<HTMLElement>(null)

  // The header wraps onto a second row on a phone, so what sticks under it needs its real height.
  useEffect(() => {
    const el = header.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    publish()
    const watcher = new ResizeObserver(publish)
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [])

  function signOut() {
    clearToken()
    queryClient.clear()
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header" ref={header}>
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label="TicketRush, home" viewTransition>
            TicketRush
          </Link>
          <nav aria-label="Main" className="site-nav">
            <NavLink to="/" end viewTransition>
              Events
            </NavLink>
            <HoldTimer />
            {token && <NavLink to="/tickets" viewTransition>My tickets</NavLink>}
            {token && <NavLink to="/account" viewTransition>Account</NavLink>}
            {me?.role === 'ORGANIZER' && <NavLink to="/console" viewTransition>Console</NavLink>}
            {token ? (
              <>
                {me && <span className="site-nav__who">{me.displayName}</span>}
                <button type="button" className="site-nav__button" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <NavLink to="/signin" viewTransition>Sign in</NavLink>
            )}
          </nav>
        </div>
      </header>
      <ConnectionBar />
      <VerifyEmailBanner />
      <RouteEffects />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <nav className="site-footer__links" aria-label="About">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refunds">Refunds</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </footer>
    </>
  )
}
