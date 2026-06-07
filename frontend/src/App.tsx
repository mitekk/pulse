// ============================================================
// App root — wires QueryClient, Router, and bootstrap
// ============================================================

import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { router } from './app/router'
import { useBootstrap } from './lib/auth/useBootstrap'
import { FullPageSpinner } from './components/FullPageSpinner'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
})

function AppWithBootstrap() {
  const isInitialized = useBootstrap()

  if (!isInitialized) {
    return <FullPageSpinner />
  }

  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppWithBootstrap />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
