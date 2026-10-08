import { createBrowserRouter, type RouteObject } from 'react-router'
import { Layout } from './Layout'
import { NotFound, RouteError } from './RouteError'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('../features/discover/Discover')).Discover }) },
      { path: 'events/:id', lazy: async () => ({ Component: (await import('../features/event/EventPage')).EventPage }) },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
