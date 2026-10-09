import { Outlet } from 'react-router'
import { ConsoleSkeleton } from '../../components/PageSkeletons'
import { ErrorScreen } from '../../components/ErrorScreen'
import { useMe } from '../auth/api'
import { ConsoleBar } from './ConsoleBar'

/**
 * The console is for organizers. This only decides what to show: the server refuses every organizer call from anyone
 * else, so hiding a page here is a courtesy, never the protection. Sits under RequireAuth, so a token exists.
 */
export function RequireOrganizer() {
  const me = useMe()
  if (me.isPending) return <ConsoleSkeleton />
  if (me.error) throw me.error
  if (me.data?.role !== 'ORGANIZER') {
    return (
      <ErrorScreen eyebrow="Organizers only" title="This part of TicketRush is for organizers" primary={{ label: 'See what is on', to: '/' }}>
        <p>You are signed in with a guest account. Organizer accounts are created by TicketRush, so there is nothing to change here.</p>
      </ErrorScreen>
    )
  }
  return (
    <>
      <ConsoleBar />
      <Outlet />
    </>
  )
}
