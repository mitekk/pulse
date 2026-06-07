// ============================================================
// API DTO types — aligned to docs/api-contract.md
// All IDs are strings (Snowflake or UUID serialized as string)
// All timestamps are ISO 8601 UTC strings
// ============================================================

// ── Cursor pagination envelope ────────────────────────────
export interface CursorPage<T> {
  items: T[]
  cursor: string | null
  hasMore: boolean
}

// ── Error envelope ────────────────────────────────────────
export interface ApiErrorDetail {
  field: string
  message: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: ApiErrorDetail[]
}

export interface ApiErrorResponse {
  error: ApiErrorBody
}

// ── User DTOs ─────────────────────────────────────────────
export interface UserDto {
  id: string
  handle: string
  displayName: string
  email: string
  avatarUrl: string | null
  isVerified: boolean
  isPrivate: boolean
  dmPrivacy: 'everyone' | 'following'
  createdAt: string
}

export interface UserCardDto {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  isPrivate: boolean
}

export interface ProfileDto {
  id: string
  handle: string
  displayName: string
  bio: string | null
  location: string | null
  website: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  isVerified: boolean
  isPrivate: boolean
  counts: {
    followers: number
    following: number
    posts: number
  }
  viewer: {
    following: boolean
    followedBy: boolean
    blocked: boolean
    muted: boolean
    followRequested: boolean
  } | null
  createdAt: string
}

// ── Session DTO ───────────────────────────────────────────
export interface SessionDto {
  id: string
  userAgent: string
  ip: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

// ── Post DTO ──────────────────────────────────────────────
export interface PostAuthorDto {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
}

export interface PostEntities {
  mentions: Array<{ handle: string; userId: string; start: number; end: number }>
  hashtags: Array<{ tag: string; start: number; end: number }>
  urls: Array<{ url: string; displayUrl: string; start: number; end: number }>
}

export interface MediaVariants {
  thumb?: string
  small?: string
  medium?: string
  large?: string
  mp4?: string
  poster?: string
}

export interface PostMediaDto {
  id: string
  type: 'image' | 'gif' | 'video'
  variants: MediaVariants
  altText: string | null
  width: number | null
  height: number | null
}

export type ReplyPolicy = 'everyone' | 'following' | 'mentioned'

export interface PostDto {
  id: string
  author: PostAuthorDto
  text: string | null
  createdAt: string
  entities: PostEntities
  media: PostMediaDto[]
  counts: {
    replies: number
    reposts: number
    likes: number
    bookmarks: number
  }
  viewer: {
    liked: boolean
    reposted: boolean
    bookmarked: boolean
  } | null
  replyToId: string | null
  replyPolicy: ReplyPolicy
  quoteOf: PostDto | null
  repostOf: PostDto | null
  repostedBy: { handle: string; displayName: string } | null
  deleted: boolean
}

// ── MediaDto ──────────────────────────────────────────────
export interface MediaDto {
  id: string
  type: 'image' | 'gif' | 'video'
  status: 'pending' | 'processing' | 'ready' | 'failed'
  mime: string
  width: number | null
  height: number | null
  durationMs: number | null
  altText: string | null
  variants: MediaVariants
  createdAt: string
}

// ── Notification DTO ──────────────────────────────────────
export type NotificationType =
  | 'like'
  | 'reply'
  | 'repost'
  | 'quote'
  | 'follow'
  | 'mention'
  | 'follow_request'
  | 'dm'

export interface NotificationDto {
  id: string
  type: NotificationType
  actors: UserCardDto[]
  otherCount: number
  post: PostDto | null
  readAt: string | null
  createdAt: string
}

// ── Message DTO ───────────────────────────────────────────
export interface MessageDto {
  id: string
  conversationId: string
  senderId: string
  text: string | null
  media: MediaDto | null
  clientNonce: string
  createdAt: string
}

// ── Conversation DTO ──────────────────────────────────────
export interface ConversationDto {
  id: string
  participants: UserCardDto[]
  lastMessage: MessageDto | null
  unreadCount: number
  muted: boolean
  createdAt: string
}

// ── Follow request DTO ────────────────────────────────────
export interface FollowRequestDto {
  id: string
  requester: UserCardDto
  createdAt: string
}

// ── Search ────────────────────────────────────────────────
export interface TagDto {
  tag: string
  postCount: number
}

export interface TrendDto {
  tag: string
  postCount: number
  postsInWindow: number
}

// ── Auth request / response types ────────────────────────
export interface RegisterRequest {
  email: string
  handle: string
  password: string
  displayName?: string
}

export interface LoginRequest {
  emailOrHandle: string
  password: string
}

export interface AuthResponse {
  user: UserDto
  accessToken: string
}

export interface RefreshResponse {
  accessToken: string
}

export interface MeResponse {
  user: UserDto
}

export interface VerifyEmailRequest {
  token: string
}

export interface VerifyEmailResponse {
  message: string
}
