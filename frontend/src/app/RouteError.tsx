import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { ApiError } from '../api/errors'

export function NotFound() {
  return <Notice heading="We could not find that page" detail="The link may be old, or the event may have ended." />
}

/** Shown when a page throws. Says what happened in plain words and offers a way out. */
export function RouteError() {
  const error = useRouteError()
  let heading = 'Something went wrong'
  let detail = 'Try again, and if it keeps happening, come back in a few minutes.'

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />
  }
  if (error instanceof ApiError) {
    heading = error.isNetwork ? 'No connection' : error.title || heading
    detail = error.message
  }

  return <Notice heading={heading} detail={detail} />
}

function Notice({ heading, detail }: { heading: string; detail: string }) {
  return (
    <div className="page" role="alert">
      <p className="label">Error</p>
      <h1>{heading}</h1>
      <p style={{ marginTop: 'var(--space-4)' }}>{detail}</p>
      <p style={{ marginTop: 'var(--space-5)' }}>
        <Link to="/">See what is on</Link>
      </p>
    </div>
  )
}
