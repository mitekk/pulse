// ============================================================
// React Router v6 route table
// Modal routes use location.state.background pattern
// ============================================================
/* eslint-disable react-refresh/only-export-components */

import React, { Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AdaptiveShell } from './AdaptiveShell'
import { GuestGuard } from './GuestGuard'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { FullPageSpinner } from '@/components/FullPageSpinner'

// ── Lazy-loaded auth pages ─────────────────────────────────
const LoginPage = React.lazy(() => import('@/pages/LoginPage'))
const RegisterPage = React.lazy(() => import('@/pages/RegisterPage'))
const VerifyEmailPage = React.lazy(() => import('@/pages/VerifyEmailPage'))

// ── Lazy-loaded placeholder pages ─────────────────────────
const HomePage = React.lazy(() => import('@/pages/HomePage'))
const ExplorePage = React.lazy(() => import('@/pages/ExplorePage'))
const SearchPage = React.lazy(() => import('@/pages/SearchPage'))
const NotificationsPage = React.lazy(() => import('@/pages/NotificationsPage'))
const MessagesPage = React.lazy(() => import('@/pages/MessagesPage'))
const ConversationPage = React.lazy(() => import('@/pages/ConversationPage'))
const BookmarksPage = React.lazy(() => import('@/pages/BookmarksPage'))
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'))
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'))
const PostPage = React.lazy(() => import('@/pages/PostPage'))
const PhotoPage = React.lazy(() => import('@/pages/PhotoPage'))
const TagTimelinePage = React.lazy(() => import('@/pages/TagTimelinePage'))

// ── Modal routes (lazy) ────────────────────────────────────
const ComposeModal = React.lazy(() => import('@/pages/ComposeModal'))
const ComposeDmModal = React.lazy(() => import('@/pages/ComposeDmModal'))

const LazyPage = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
)

export const router = createBrowserRouter([
  // ── Auth routes (guest only) ───────────────────────────
  {
    element: (
      <GuestGuard>
        <LazyPage>
          <Outlet />
        </LazyPage>
      </GuestGuard>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },

  // ── Verify email (no auth required) ───────────────────
  {
    path: '/verify-email',
    element: (
      <LazyPage>
        <VerifyEmailPage />
      </LazyPage>
    ),
    errorElement: <RouteErrorBoundary />,
  },

  // ── App shell ──────────────────────────────────────────
  // AdaptiveShell renders AppShell for authed users, PublicShell for
  // guests on routes marked `handle.public`, and redirects guests to
  // /login on every other (private) route.
  {
    element: <AdaptiveShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: '/',
        element: (
          <LazyPage>
            <HomePage />
          </LazyPage>
        ),
      },
      {
        path: '/explore',
        element: (
          <LazyPage>
            <ExplorePage />
          </LazyPage>
        ),
      },
      {
        path: '/search',
        element: (
          <LazyPage>
            <SearchPage />
          </LazyPage>
        ),
      },
      {
        path: '/notifications',
        element: (
          <LazyPage>
            <NotificationsPage />
          </LazyPage>
        ),
      },
      {
        path: '/notifications/mentions',
        element: (
          <LazyPage>
            <NotificationsPage />
          </LazyPage>
        ),
      },
      {
        path: '/tag/:tag',
        element: (
          <LazyPage>
            <TagTimelinePage />
          </LazyPage>
        ),
      },
      {
        path: '/messages',
        element: (
          <LazyPage>
            <MessagesPage />
          </LazyPage>
        ),
      },
      {
        path: '/messages/:id',
        element: (
          <LazyPage>
            <ConversationPage />
          </LazyPage>
        ),
      },
      {
        path: '/bookmarks',
        element: (
          <LazyPage>
            <BookmarksPage />
          </LazyPage>
        ),
      },
      {
        path: '/settings/*',
        element: (
          <LazyPage>
            <SettingsPage />
          </LazyPage>
        ),
      },
      // ── Profile routes (public) ─────────────────────────
      {
        path: '/:handle',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="posts" />
          </LazyPage>
        ),
      },
      {
        path: '/:handle/replies',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="replies" />
          </LazyPage>
        ),
      },
      {
        path: '/:handle/media',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="media" />
          </LazyPage>
        ),
      },
      {
        path: '/:handle/likes',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="likes" />
          </LazyPage>
        ),
      },
      {
        path: '/:handle/followers',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="followers" />
          </LazyPage>
        ),
      },
      {
        path: '/:handle/following',
        handle: { public: true },
        element: (
          <LazyPage>
            <ProfilePage tab="following" />
          </LazyPage>
        ),
      },
      // ── Post / thread (public) ──────────────────────────
      {
        path: '/:handle/status/:postId',
        handle: { public: true },
        element: (
          <LazyPage>
            <PostPage />
          </LazyPage>
        ),
      },
      // ── Photo lightbox (modal route, public) ────────────
      {
        path: '/:handle/status/:postId/photo/:idx',
        handle: { public: true },
        element: (
          <LazyPage>
            <PhotoPage />
          </LazyPage>
        ),
      },

      // ── Modal routes ────────────────────────────────────
      {
        path: '/compose',
        element: (
          <LazyPage>
            <ComposeModal />
          </LazyPage>
        ),
      },
      {
        path: '/compose/dm',
        element: (
          <LazyPage>
            <ComposeDmModal />
          </LazyPage>
        ),
      },
    ],
  },
])
