import { Navigate, Outlet, useLocation } from 'react-router'
import { useToken } from './session'

/**
 * Pages that need a signed-in guest sit under this. Someone who is not signed in is sent to sign in and brought
 * back to where they were, which also covers a token that expired in the middle of something.
 */
export function RequireAuth() {
  const token = useToken()
  const location = useLocation()
  if (!token) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
