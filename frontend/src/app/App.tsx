import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { createQueryClient } from './queryClient'
import { createRouter } from './routes'

export function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createRouter)
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
