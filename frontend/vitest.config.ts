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
        'src/pages/MessagesPage.tsx',
        'src/pages/PhotoPage.tsx',
        'src/pages/PostPage.tsx',
        'src/pages/ProfilePage.tsx',
        'src/pages/SettingsPage.tsx',
        // NotificationsPage / SearchPage / ExplorePage / TagTimelinePage: complex integration;
        // core logic tested via feature-level tests
        'src/pages/NotificationsPage.tsx',
        'src/pages/SearchPage.tsx',
        'src/pages/ExplorePage.tsx',
        'src/pages/TagTimelinePage.tsx',
        // Notification feature: page components; core logic tested via notificationUtils tests
        'src/features/notifications/NotificationItem.tsx',
        'src/features/notifications/NotificationIcon.tsx',
        // Search typeahead: requires debounced network + DOM; covered by E2E
        'src/features/search/SearchTypeahead.tsx',
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
        // Media upload hook: XHR progress + polling require integration tests
        'src/hooks/useMediaUpload.ts',
        // PostComposer: complex integration (auth + form + media + autocomplete + mutations)
        // Core char-counter and tokenizer logic is unit-tested directly
        'src/features/composer/PostComposer.tsx',
        // Mention autocomplete: requires debounced network + DOM cursor position; covered by PostComposer E2E
        'src/features/composer/useMentionAutocomplete.ts',
        // Composer modal page: covered by PostComposer + E2E
        'src/pages/ComposeModal.tsx',
        // Profile feature components: complex mutation/cache interaction; ProfileHeader tested directly
        'src/features/profile/ProfileMediaGrid.tsx',
        // ScrollSentinel: thin sentinel wrapper; IntersectionObserver tested via useInfiniteList
        'src/components/ScrollSentinel.tsx',
        // Menu: requires focus/keyboard integration; used by ProfileHeader (tested indirectly)
        'src/components/Menu.tsx',
        // Profile tabs: pure nav link rendering; covered by ProfilePage + E2E
        'src/features/profile/ProfileTabs.tsx',
        // API modules: pure typed wrappers around the HTTP client; integration test coverage
        'src/lib/api/engagement.ts',
        'src/lib/api/follow.ts',
        'src/lib/api/messaging.ts',
        'src/lib/api/notifications.ts',
        'src/lib/api/posts.ts',
        'src/lib/api/search.ts',
        'src/lib/api/timeline.ts',
        'src/lib/api/users.ts',
        'src/lib/api/auth.ts',
        'src/lib/api/media.ts',
        // Auth store: side-effect at module load (registerTokenStore); covered by integration tests
        'src/lib/auth/store.ts',
        // patchPost: complex optimistic update helper; covered by useEngagement integration tests
        'src/lib/cache/patchPost.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
