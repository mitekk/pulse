import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
      },
      exclude: [
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Infra HTTP client: requires a real server; covered by integration tests
        'src/lib/api/client.ts',
        // Route-level page stubs (no logic yet — will be filled per-phase)
        'src/pages/BookmarksPage.tsx',
        'src/pages/ComposeDmModal.tsx',
        'src/pages/ComposeModal.tsx',
        'src/pages/ConversationPage.tsx',
        'src/pages/ExplorePage.tsx',
        'src/pages/MessagesPage.tsx',
        'src/pages/NotificationsPage.tsx',
        'src/pages/PhotoPage.tsx',
        'src/pages/PostPage.tsx',
        'src/pages/ProfilePage.tsx',
        'src/pages/SearchPage.tsx',
        'src/pages/SettingsPage.tsx',
        // App bootstrap / routing (E2E coverage)
        'src/app/router.tsx',
        'src/app/AppShell.tsx',
        'src/app/AuthGuard.tsx',
        'src/app/GuestGuard.tsx',
        'src/app/RouteErrorBoundary.tsx',
        'src/App.tsx',
        // Query keys are pure constants — no branch logic
        'src/lib/cache/queryKeys.ts',
        // Typing store: covered by realtime tests
        'src/lib/stores/typingStore.ts',
        // Home page: requires full integration (timeline + WS); covered by E2E
        'src/pages/HomePage.tsx',
        // Feature hooks that require real network
        'src/features/timeline/useHomeTimeline.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
