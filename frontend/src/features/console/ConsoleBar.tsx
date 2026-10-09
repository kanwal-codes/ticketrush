import { Link, NavLink } from 'react-router'
import './consolebar.css'

/**
 * Shown above every console page. The header is the same for guests and organizers, so this is what says "you are running
 * events now, not browsing", and it is the way out to the public site.
 */
export function ConsoleBar() {
  return (
    <nav className="consolebar" aria-label="Organizer console">
      <div className="consolebar__inner">
        <span className="consolebar__mode">Organizer console</span>
        <NavLink to="/console" end viewTransition>
          Your events
        </NavLink>
        <Link to="/" viewTransition>
          View as a guest
        </Link>
      </div>
    </nav>
  )
}
