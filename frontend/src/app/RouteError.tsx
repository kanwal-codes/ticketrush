import { isRouteErrorResponse, useLocation, useRouteError } from 'react-router'
import { ErrorScreen, type ErrorAction } from '../components/ErrorScreen'
import { describeError } from '../lib/errorCopy'

export function NotFound() {
  const { pathname } = useLocation()
  return (
    <ErrorScreen eyebrow="404" title="We could not find that page" primary={{ label: 'See what is on', to: '/' }} details={{ status: 404, path: pathname }}>
      <p>The link may be old, or the event may have ended.</p>
    </ErrorScreen>
  )
}

/** Shown when a page throws. Says what happened in plain words and offers the one next step that fits. */
export function RouteError() {
  const error = useRouteError()
  const { pathname } = useLocation()

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />

  const d = describeError(error)
  const retry: ErrorAction = { label: 'Try again', onClick: () => location.reload() }
  const action: Record<typeof d.recovery, ErrorAction | undefined> = {
    retry,
    wait: retry,
    signin: { label: 'Sign in', to: '/signin' },
    rejoin: { label: 'See what is on', to: '/' },
    home: { label: 'See what is on', to: '/' },
    none: undefined,
  }
  const primary = action[d.recovery]
  const eyebrow = d.kind === 'network' ? 'Offline' : d.status ? `Error ${d.status}` : 'Error'

  return (
    <ErrorScreen eyebrow={eyebrow} title={d.title} primary={primary} secondary={primary?.to === '/' ? undefined : { label: 'See what is on', to: '/' }} details={{ status: d.status, code: d.code, path: pathname }}>
      <p>{d.message}</p>
    </ErrorScreen>
  )
}
