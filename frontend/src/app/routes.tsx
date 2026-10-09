import { createBrowserRouter, type RouteObject } from 'react-router'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireOrganizer } from '../features/console/RequireOrganizer'
import { Layout } from './Layout'
import { BootFallback } from './BootFallback'
import { NotFound, RouteError } from './RouteError'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    // Shown for the moment before the first page's code has loaded.
    HydrateFallback: BootFallback,
    errorElement: <RouteError />,
    children: [
      {
        // Errors from a page are shown inside the layout, so the header (and the hold timer) stay put.
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: async () => ({ Component: (await import('../features/discover/Discover')).Discover }) },
          { path: 'events/:id', lazy: async () => ({ Component: (await import('../features/event/EventPage')).EventPage }) },
          {
            // Everything below needs a signed-in guest.
            element: <RequireAuth />,
            children: [
              { path: 'events/:id/seats', lazy: async () => ({ Component: (await import('../features/seats/SeatsPage')).SeatsPage }) },
              { path: 'events/:id/checkout', lazy: async () => ({ Component: (await import('../features/checkout/CheckoutPage')).CheckoutPage }) },
              { path: 'tickets', lazy: async () => ({ Component: (await import('../features/tickets/TicketsPage')).TicketsPage }) },
              { path: 'events/:id/queue', lazy: async () => ({ Component: (await import('../features/queue/WaitingRoom')).WaitingRoom }) },
              {
                // The organizer's console. The guard is small and always loaded; the pages themselves are lazy.
                element: <RequireOrganizer />,
                children: [
                  { path: 'console', lazy: async () => ({ Component: (await import('../features/console/ConsoleEvents')).ConsoleEvents }) },
                  { path: 'console/events/new', lazy: async () => ({ Component: (await import('../features/console/EventForm')).EventForm }) },
                  { path: 'console/events/:id/edit', lazy: async () => ({ Component: (await import('../features/console/EventForm')).EventForm }) },
                  { path: 'console/events/:id', lazy: async () => ({ Component: (await import('../features/console/Dashboard')).Dashboard }) },
                  { path: 'console/events/:id/scan', lazy: async () => ({ Component: (await import('../features/console/Scanner')).Scanner }) },
                ],
              },
            ],
          },
          { path: 'signin', lazy: async () => ({ Component: (await import('../features/auth/pages')).SignIn }) },
          { path: 'register', lazy: async () => ({ Component: (await import('../features/auth/pages')).Register }) },
          { path: 'forgot-password', lazy: async () => ({ Component: (await import('../features/auth/recovery')).ForgotPassword }) },
          { path: 'reset-password', lazy: async () => ({ Component: (await import('../features/auth/recovery')).ResetPassword }) },
          { path: 'verify-email', lazy: async () => ({ Component: (await import('../features/auth/recovery')).VerifyEmail }) },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
