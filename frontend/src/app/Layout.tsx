import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { clearToken, useToken } from '../auth/session'
import { safeRedirect } from '../auth/redirect'
import { useMe } from '../features/auth/api'
import { VerifyEmailBanner } from '../features/auth/VerifyEmailBanner'
import { ConnectionBar } from '../components/ConnectionBar'
import { BackBar } from '../components/BackBar'
import { HoldTimer } from '../features/seats/HoldTimer'
import { AccountMenu } from './AccountMenu'
import { RouteEffects } from './RouteEffects'
import './layout.css'

const YEAR = new Date().getFullYear()

export function Layout() {
  const token = useToken()
  const queryClient = useQueryClient()
  const profile = useMe().data
  const me = token ? profile : undefined
  const header = useRef<HTMLElement>(null)
  const { pathname, search, state } = useLocation()
  const authReturn = pathname === '/signin' || pathname === '/register'
    ? safeRedirect((state as { from?: string } | null)?.from)
    : pathname + search
  const journey = pathname.match(/^\/events\/(\d+)(?:\/(queue|seats|checkout))?$/)
  const authPage = ['/signin', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(pathname)

  // Discover's search drops to a second row on a phone, so what sticks under the header needs its real height.
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
      <header className={`site-header${pathname === '/' ? ' site-header--discover' : ''}${journey ? ' site-header--journey' : ''}`} ref={header}>
        <div className="site-header__inner">
          <Link to="/" className="brand" aria-label="TicketRush, home" viewTransition>
            ticket<span>rush</span><i>.</i>
          </Link>
          <div id="discovery-toolbar" className="discovery-toolbar-slot" />
          <nav aria-label="Main" className="site-nav">
            {!journey && !authPage && pathname !== '/' && <NavLink to="/" end viewTransition>Discover</NavLink>}
            <HoldTimer />
            {me?.role === 'ORGANIZER' && <NavLink to="/console" viewTransition>Console</NavLink>}
            {token ? <AccountMenu me={me} onSignOut={signOut} /> : <><NavLink to="/signin" state={{ from: authReturn }} viewTransition>Sign in</NavLink><NavLink to="/register" state={{ from: authReturn }} className="site-nav__signup" viewTransition>Sign up</NavLink></>}
          </nav>
        </div>
      </header>
      <ConnectionBar />
      <VerifyEmailBanner />
      <RouteEffects />
      <main id="main" tabIndex={-1}>
        {journey && <div className="journey-chrome">
          <BackBar shortLabel={journey[2] === 'checkout' ? 'Seats' : journey[2] ? 'Event' : 'All events'} to={journey[2] === 'checkout' ? `/events/${journey[1]}/seats` : journey[2] ? `/events/${journey[1]}` : '/'}>{journey[2] === 'checkout' ? 'Change seats' : journey[2] ? 'Back to the event' : 'Back to all events'}</BackBar>
          <nav className="purchase-progress" aria-label="Purchase progress">
            <Link to={`/events/${journey[1]}`} aria-current={!journey[2] ? 'step' : undefined}><span className="purchase-progress__number" aria-hidden="true">01</span> Event</Link>
            <span aria-hidden="true" />
            <span aria-current={journey[2] === 'queue' || journey[2] === 'seats' ? 'step' : undefined}><span className="purchase-progress__number" aria-hidden="true">02</span> Seats</span>
            <span aria-hidden="true" />
            <span aria-current={journey[2] === 'checkout' ? 'step' : undefined}><span className="purchase-progress__number" aria-hidden="true">03</span> Checkout</span>
          </nav>
        </div>}
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__identity">
            <Link to="/" className="brand site-footer__brand" aria-label="TicketRush" viewTransition>
              ticket<span>rush</span><i>.</i>
            </Link>
            <p>Find your next event.</p>
          </div>
          <div className="site-footer__meta">
            <nav className="site-footer__links" aria-label="About">
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/refunds">Refunds</Link>
              <Link to="/contact">Contact</Link>
            </nav>
            <p className="site-footer__copyright">© {YEAR} TicketRush</p>
          </div>
        </div>
      </footer>
    </>
  )
}
