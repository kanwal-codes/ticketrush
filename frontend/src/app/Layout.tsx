import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet } from 'react-router'
import { clearToken, useToken } from '../auth/session'
import { useMe } from '../features/auth/api'
import { HoldTimer } from '../features/seats/HoldTimer'
import { RouteEffects } from './RouteEffects'
import './layout.css'

export function Layout() {
  const token = useToken()
  const queryClient = useQueryClient()
  const me = useMe().data

  function signOut() {
    clearToken()
    queryClient.clear()
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label="TicketRush, home" viewTransition>
            TicketRush
          </Link>
          <nav aria-label="Main" className="site-nav">
            <NavLink to="/" end viewTransition>
              Events
            </NavLink>
            <HoldTimer />
            <NavLink to="/tickets" viewTransition>My tickets</NavLink>
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
      <RouteEffects />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <p className="label">Final prices, a fair queue, and a seat is never sold twice.</p>
      </footer>
    </>
  )
}
