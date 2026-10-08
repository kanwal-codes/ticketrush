import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../app/routes'

/** Renders the real routes at an address, with a query client that does not retry or cache between tests. */
export function renderRoute(path: string, state?: unknown) {
  const url = new URL(path, 'http://localhost')
  const router = createMemoryRouter(routes, { initialEntries: [{ pathname: url.pathname, search: url.search, state }] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}
