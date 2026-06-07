# Frontend Phase 1 — Shell + Auth — Summary

**Completed:** 2026-06-07
**Subtask:** 1 of Phase 3 (Frontend Phase 1)

---

## Product Identity

**Name:** PULSE

**Aesthetic direction:** Dark-first editorial brutalist. Deep obsidian/charcoal backgrounds (`#0e0e0f` dark, `#f5f2ee` light), sharp vermillion accent (`#e8402a`), bone-white text. Intentional, high-contrast, magazine-meets-terminal.

**Typefaces:**
- Display: `DM Serif Display` (headings, wordmark, auth page titles)
- Body: `Instrument Sans` (nav labels, post text, UI copy)
- Mono: `JetBrains Mono` (handles `@alice`, handle input prefix, strength meter labels)

**Theme:** Dark default, light mode available, respects `prefers-color-scheme`, persists choice in `localStorage`. Toggle in the nav rail.

**One unforgettable thing:** The auth pages have a full vermillion left panel (420px wide) with a diagonal hatch-mark texture, a huge "pulse" wordmark in DM Serif Display at 5rem, and seductive copy — unmistakably branded even before any posts exist.

---

## What Was Built

### 1. Scaffold + Toolchain
- Vite 8 + React 19 + TypeScript 6 (strict, `erasableSyntaxOnly`)
- ESLint (flat config) + Prettier + `eslint-config-prettier`
- Vitest + `@testing-library/react` + `@testing-library/jest-dom`
- All scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:coverage`

### 2. Token Layer
- `src/styles/tokens.css` — full CSS variable system: color, typography, spacing, radius, shadow, z-index, motion
- Light and dark themes via `[data-theme='light']` and `prefers-color-scheme`
- `src/index.css` — imports tokens + `@import 'tailwindcss'` with `@theme` block mapping vars to Tailwind

### 3. Routing
- `src/app/router.tsx` — `createBrowserRouter` with full route table (18 routes)
- Code-split at every route boundary with `React.lazy()` + `Suspense`
- Modal-as-route infra (`/compose`, `/compose/dm`) via `location.state.background`
- Profile tabs (`/:handle/replies|media|likes|followers|following`), thread (`/:handle/status/:postId`), photo lightbox

### 4. App Shell
- `src/app/AppShell.tsx` — responsive 3-column layout
  - Desktop ≥1100px: expanded nav rail (240px) + center feed (≤600px) + right sidebar (320px)
  - Tablet 700–1099px: icon-only rail (68px) + center feed
  - Mobile <700px: sticky top bar + bottom tab bar (4 tabs)
- Sticky header per route
- Nav items with unread badge placeholders (Notifications, Messages)
- User menu dropdown: profile link + sign-out

### 5. Auth Infrastructure
- `src/lib/auth/store.ts` — Zustand: access token in memory only (never localStorage)
- `src/lib/api/client.ts` — typed fetch wrapper: Bearer header, credentials, 401 interceptor (single refresh, concurrent queue, replay on success, logout+redirect on failure)
- `src/lib/auth/useBootstrap.ts` — silent refresh on mount, sets user state, marks initialized
- `src/app/AuthGuard.tsx` — redirects unauthenticated to `/login?returnTo=`
- `src/app/GuestGuard.tsx` — redirects authenticated away from auth pages
- Socket seam: `selectAccessToken` exposed in store for Phase 2 socket wiring

### 6. Typed API Layer
- `src/lib/api/auth.ts` — all 8 auth endpoints
- `src/types/api.ts` — complete DTO types: UserDto, ProfileDto, UserCardDto, PostDto, MediaDto, NotificationDto, MessageDto, ConversationDto, SessionDto, TagDto, TrendDto + all auth request/response shapes

### 7. Auth Pages
- `src/pages/LoginPage.tsx` — email/handle + password; 429 rate-limit banner with retry seconds; generic 401 message; `returnTo` redirect after login
- `src/pages/RegisterPage.tsx` — displayName + email + handle (live availability check with 500ms debounce, 404→available, conflict→taken) + password with PasswordStrengthMeter
- `src/pages/VerifyEmailPage.tsx` — reads `?token=` from URL, calls API, 4 distinct states: loading/success/invalid/error

### 8. Components
- `FullPageSpinner` — bootstrap loading with pulse wordmark
- `EmptyState` — all non-built pages render this
- `PasswordStrengthMeter` — 4-segment bar with color-coded label

### 9. Tests
- `src/lib/auth/store.test.ts` — 5 unit tests for Zustand auth store
- `src/components/PasswordStrengthMeter.test.tsx` — 4 component tests
- All 9 pass

### 10. Config Files
- `vite.config.ts` — proxy `/api` → `localhost:3000`, WS proxy `/socket.io`, `build.sourcemap: true`
- `.env.example` — `VITE_API_BASE_URL`, `VITE_WS_URL`
- `tsconfig.app.json` — strict + path aliases `@/*`
- `vitest.config.ts` — jsdom, coverage gate 80%

---

## Key File Paths

```
frontend/src/
  app/
    router.tsx          — full route table (lazy, modal infra)
    AppShell.tsx        — 3-column responsive shell
    AuthGuard.tsx       — protect auth routes
    GuestGuard.tsx      — protect public-only routes
    RouteErrorBoundary.tsx
  lib/
    auth/
      store.ts          — Zustand auth store (token in memory)
      useBootstrap.ts   — silent refresh on mount
      useCurrentUser.ts — user/isAuthenticated selectors
    api/
      client.ts         — fetch client + 401 interceptor + refresh queue
      auth.ts           — auth API functions
    theme.ts            — theme store + localStorage persistence
  types/
    api.ts              — all DTO types
  styles/
    tokens.css          — full CSS variable token layer
  pages/
    LoginPage.tsx
    RegisterPage.tsx
    VerifyEmailPage.tsx
    ...13 placeholder pages
  components/
    FullPageSpinner.tsx
    EmptyState.tsx
    PasswordStrengthMeter.tsx
frontend/.env.example
frontend/vite.config.ts
frontend/tsconfig.app.json
```

---

## Token / Theming System

All design tokens are CSS custom properties in `src/styles/tokens.css`. The system uses:
- `:root` = dark theme (default)
- `[data-theme='light']` = light override
- `@media (prefers-color-scheme: light) :root:not([data-theme])` = system light fallback

Tailwind's `@theme` block in `index.css` maps all vars so they're available as Tailwind utilities. The `useThemeStore` writes to `localStorage` and calls `document.documentElement.setAttribute('data-theme', ...)`.

---

## Auth / Token Flow (for Phases 2–7)

1. App mounts → `useBootstrap` calls `POST /auth/refresh` (sends httpOnly cookie)
2. Success: sets `accessToken` in Zustand memory + fetches `GET /auth/me` → sets `user`
3. Failure: marks `isInitialized` (user is guest)
4. All API calls from `apiClient` send `Authorization: Bearer <accessToken>`
5. On 401: single refresh attempt, queued concurrent requests replay on success
6. Phase 2: `selectAccessToken` exposes token for Socket.IO handshake `auth: { token }`
7. On token refresh: `setAccessToken` updates Zustand → Phase 2 must re-emit auth to socket

---

## What Phases 2–7 Build On

- **Phase 2**: Import `useAuthStore`'s `selectAccessToken` for Socket.IO handshake; add typed REST client modules per domain; set up `useInfiniteList`; wire WS event router to TanStack Query cache
- **Phase 3**: Import `EmptyState`, `AppShell` already wired; add `PostCard`, `ActionBar`, `PostComposer` under `src/components/`; fill in `HomePage.tsx` and `PostPage.tsx`
- **Phase 4**: Fill `ProfilePage.tsx`, `SettingsPage.tsx`, `BookmarksPage.tsx`
- **Phase 5**: Fill `NotificationsPage.tsx`, `SearchPage.tsx`, `ExplorePage.tsx`
- **Phase 6**: Fill `MessagesPage.tsx`, `ConversationPage.tsx`
- **Phase 7**: Extract inline styles to proper design system components; add `Dockerfile`
