// ============================================================
// Query Keys Factory — spec §C6.1
// All keys are stable arrays for precise cache invalidation.
// ============================================================

export const queryKeys = {
  // ── Auth ─────────────────────────────────────────────────
  auth: {
    me: () => ['auth', 'me'] as const,
    sessions: () => ['auth', 'sessions'] as const,
  },

  // ── Users ────────────────────────────────────────────────
  users: {
    profile: (handle: string) => ['users', handle, 'profile'] as const,
    posts: (handle: string) => ['users', handle, 'posts'] as const,
    replies: (handle: string) => ['users', handle, 'replies'] as const,
    media: (handle: string) => ['users', handle, 'media'] as const,
    likes: (handle: string) => ['users', handle, 'likes'] as const,
    followers: (handle: string) => ['users', handle, 'followers'] as const,
    following: (handle: string) => ['users', handle, 'following'] as const,
  },

  // ── Follow Requests ──────────────────────────────────────
  followRequests: {
    list: () => ['follow-requests'] as const,
  },

  // ── Posts ────────────────────────────────────────────────
  posts: {
    detail: (id: string) => ['posts', id] as const,
    thread: (id: string) => ['posts', id, 'thread'] as const,
    replies: (id: string) => ['posts', id, 'replies'] as const,
    reposts: (id: string) => ['posts', id, 'reposts'] as const,
    quotes: (id: string) => ['posts', id, 'quotes'] as const,
    likes: (id: string) => ['posts', id, 'likes'] as const,
  },

  // ── Timelines ────────────────────────────────────────────
  timeline: {
    home: () => ['timeline', 'home'] as const,
    hashtag: (tag: string) => ['timeline', 'hashtag', tag] as const,
    bookmarks: () => ['timeline', 'bookmarks'] as const,
  },

  // ── Media ────────────────────────────────────────────────
  media: {
    detail: (id: string) => ['media', id] as const,
  },

  // ── Messaging ────────────────────────────────────────────
  conversations: {
    list: () => ['conversations'] as const,
    detail: (id: string) => ['conversations', id] as const,
    messages: (id: string) => ['conversations', id, 'messages'] as const,
  },

  // ── Notifications ────────────────────────────────────────
  notifications: {
    list: () => ['notifications'] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },

  // ── Search ───────────────────────────────────────────────
  search: {
    results: (q: string, type: string) => ['search', q, type] as const,
    suggest: (q: string) => ['search', 'suggest', q] as const,
    trends: () => ['search', 'trends'] as const,
  },
} as const
