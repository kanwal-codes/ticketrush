import { Component, type ReactNode } from 'react'
import { ErrorScreen } from '../components/ErrorScreen'

interface State {
  crashed: boolean
}

/**
 * The last line of defence: if rendering itself throws outside any route, the guest still gets a page with a way out,
 * not a blank screen. Uses plain links because the router may be the thing that broke.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('TicketRush crashed', error)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <ErrorScreen
        eyebrow="Unexpected error"
        title="Something broke on our side"
        primary={{ label: 'Reload the page', onClick: () => location.reload() }}
        secondary={{ label: 'Go to the home page', href: '/' }}
        details={{ path: location.pathname }}
      >
        <p>This is not something you did. Anything you had already done is kept: your place in line, held seats and paid tickets are safe.</p>
      </ErrorScreen>
    )
  }
}
