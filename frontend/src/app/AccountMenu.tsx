import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import './accountMenu.css'

interface Me {
  displayName: string
  email: string
}

/**
 * The signed-in guest's own corner of the header: one badge with their initial, opening onto their tickets, their
 * account and the way to sign out. Replaces having "Account" and "Sign out" sit as two more items in the main row,
 * which (with a name in between) was most of why that row ran out of space on a mid-size window.
 */
export function AccountMenu({ me, onSignOut }: { me: Me | undefined; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const label = (me?.displayName || me?.email || '').trim()
  const initial = label ? [...label][0]!.toUpperCase() : '…'

  useEffect(() => {
    if (!open) return
    function outside(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="account-menu__trigger"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{initial}</span>
        <span className="visually-hidden">{label ? `Account menu, signed in as ${label}` : 'Account menu'}</span>
      </button>
      {open && (
        <div id="account-menu-panel" className="account-menu__panel">
          {me && (
            <p className="account-menu__who">
              <strong>{me.displayName}</strong>
              <span>{me.email}</span>
            </p>
          )}
          <NavLink to="/tickets" onClick={() => setOpen(false)} viewTransition>
            My tickets
          </NavLink>
          <NavLink to="/account" onClick={() => setOpen(false)} viewTransition>
            Account
          </NavLink>
          <button
            type="button"
            className="account-menu__signout"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
