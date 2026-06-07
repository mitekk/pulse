# Backend Phase 2 — Subtask 2b: Users + Follow Graph + Blocks/Mutes + VisibilityService Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (124 passing — 46 new)

---

## Tables Created (Migration `1704067200003-create-follows-blocks-mutes.ts`)

### `follows`
- Composite PK `(follower_id, followee_id)` — prevents duplicate rows at DB level
- `state VARCHAR(10) CHECK(state IN ('active','pending'))` — public→active, private→pending
- `CHECK follower_id <> followee_id` — no self-follows at DB level
- Both FKs `→ users ON DELETE CASCADE`
- Reverse index `(followee_id, follower_id)` — for "who follows user X" queries
- State index `(state)` — for filtering pending requests

### `blocks`
- Composite PK `(blocker_id, blocked_id)`, `CHECK blocker_id <> blocked_id`
- Index `(blocked_id)` — reverse lookup
- Both FKs `→ users ON DELETE CASCADE`

### `mutes`
- Composite PK `(muter_id, muted_id)`, `CHECK muter_id <> muted_id`
- Index `(muted_id)` — reverse lookup
- Both FKs `→ users ON DELETE CASCADE`

---

## Entities Created

| Entity | File | Key fields |
|--------|------|-----------|
| `Follow` | `src/modules/users/follow.entity.ts` | `followerId`, `followeeId`, `state: FollowState` |
| `Block` | `src/modules/users/block.entity.ts` | `blockerId`, `blockedId` |
| `Mute` | `src/modules/users/mute.entity.ts` | `muterId`, `mutedId` |

---

## Endpoints Implemented (`src/modules/users/`)

All routes registered under global prefix `api/v1` (NestJS global prefix in `main.ts`).

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| GET | `/users/:handle` | OptionalAuthGuard | ProfileDto + viewer flags; blocks return 403; private non-follower returns stub with nulled bio/location/website |
| PATCH | `/users/me` | AuthGuard | class-validator DTO; only provided fields mutated |
| GET | `/users/:handle/followers` | OptionalAuthGuard | Cursor paginated, `UserCardDto[]`; visibility-gated |
| GET | `/users/:handle/following` | OptionalAuthGuard | Cursor paginated, `UserCardDto[]`; visibility-gated |
| POST | `/users/:handle/follow` | AuthGuard + RateLimitGuard | 400/day rate limit; public→active+counters+notify; private→pending+notify_request |
| DELETE | `/users/:handle/follow` | AuthGuard | Idempotent; pending cancel does not decrement counters |
| POST | `/users/:handle/block` | AuthGuard | Removes follow both directions + adjusts counters; hook comment for Phase 5 timeline zset purge |
| DELETE | `/users/:handle/block` | AuthGuard | Idempotent |
| POST | `/users/:handle/mute` | AuthGuard | Idempotent |
| DELETE | `/users/:handle/mute` | AuthGuard | Idempotent |
| GET | `/follow-requests` | AuthGuard | Cursor paginated, `FollowRequestDto[]`; incoming pending requests only |
| POST | `/follow-requests/:id/accept` | AuthGuard | pending→active + counters + notifyFollowAccepted; ownership-checked |
| POST | `/follow-requests/:id/decline` | AuthGuard | Deletes pending row; ownership-checked |

**Follow request ID encoding:** `"{followerId}:{followeeId}"` (stable composite string)

---

## DTOs

| DTO | File | Purpose |
|-----|------|---------|
| `ProfileDto` | `dto/profile.dto.ts` | Full profile + `viewer` relationship flags + `counts` |
| `UserCardDto` | `dto/user-card.dto.ts` | Compact card for lists/notifications |
| `UpdateProfileDto` | `dto/update-profile.dto.ts` | PATCH /users/me body; class-validator with `@MaxLength`, `@IsUrl`, `@IsUUID` |
| `FollowRequestDto` | `dto/follow-request.dto.ts` | Incoming follow requests with `requester: UserCardDto` |
| `CursorPageDto<T>` | `dto/cursor-page.dto.ts` | Generic `{ items, cursor, hasMore }` envelope |

**ViewerRelationship flags:** `{ following, followedBy, blocked, muted, followRequested }`
- `following: true` = active follow outward
- `followRequested: true` = pending follow outward (these two are mutually exclusive)

---

## VisibilityService API (`src/modules/users/visibility.service.ts`)

**Exported for injection into PostsModule, TimelineModule, SearchModule, etc.**

```typescript
// Interfaces (exported)
interface AuthorContext { id: string; isPrivate: boolean; deletedAt?: Date | null; }
interface PostContext   { authorId: string; author: AuthorContext; deletedAt?: Date | null; }
type VisibilityResult  = { visible: true } | { visible: false; reason: 'blocked'|'private'|'deleted' };

// Methods
canViewProfile(viewerId: string | null, author: AuthorContext): Promise<VisibilityResult>
canViewPost(viewerId: string | null, post: PostContext, opts?: { suppressDeleted?: boolean }): Promise<VisibilityResult>
filterPostPage<T extends PostContext>(viewerId: string | null, posts: T[], opts?: { suppressDeleted?: boolean }): Promise<T[]>
isMuted(viewerId: string, authorId: string): Promise<boolean>
isBlocked(viewerId: string, authorId: string): Promise<boolean>
isActiveFollower(viewerId: string, authorId: string): Promise<boolean>
```

**Visibility rules implemented (§3.6):**
1. Self-view → always visible (skips all checks)
2. Block either direction → `{ visible: false, reason: 'blocked' }`
3. Private author + viewer not active follower (or anonymous) → `{ visible: false, reason: 'private' }`
4. Soft-deleted post → `{ visible: true }` by default (tombstone); `{ visible: false, reason: 'deleted' }` with `suppressDeleted: true`
5. Muted → visible on direct visit; `isMuted()` exposed for TimelineService to suppress from home feed

**Batch helper `filterPostPage`:** bulk-loads blocks + follows for all unique author IDs in a page — no N+1 queries.

---

## NotificationPort Seam (`src/modules/users/notification.port.ts`)

```typescript
export const NOTIFICATION_PORT = 'NOTIFICATION_PORT';
interface NotificationPort {
  notifyFollow(followerId: string, followeeId: string): Promise<void>;
  notifyFollowRequest(followerId: string, followeeId: string): Promise<void>;
  notifyFollowAccepted(followerId: string, followeeId: string): Promise<void>;
}
```

- **No-op implementation:** `NoopNotificationService` — logs intent at `debug` level, returns immediately
- **Wired in:** `UsersModule` provides `NOTIFICATION_PORT` → `NoopNotificationService`
- **Swap path:** Phase 7 changes `useClass: NoopNotificationService` to `RealNotificationService` in `users.module.ts`

---

## Counter Mutation Pattern (no read-modify-write)

All counter increments/decrements use direct SQL to avoid race conditions:
```sql
UPDATE users SET followers_count = followers_count + 1 WHERE id = $1
UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1
```
All counter mutations are inside `DataSource.transaction()`.

---

## Unit Tests (`tests/unit/users/`)

| File | Tests | Coverage |
|------|-------|----------|
| `users.service.spec.ts` | 23 | Follow state machine: public→active, private→pending; idempotency; block removes follows both directions; counter math; notifications emitted correctly; accept/decline ownership + NotFoundException |
| `visibility.service.spec.ts` | 23 | Full §3.6 matrix: self-view, blocked, private/anon, private/non-follower, private/active-follower, private/pending-follower; tombstone vs suppressDeleted; muted; batch filterPostPage |

**46 new tests; 124 total passing.**

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200003-create-follows-blocks-mutes.ts` |
| Follow entity | `src/modules/users/follow.entity.ts` |
| Block entity | `src/modules/users/block.entity.ts` |
| Mute entity | `src/modules/users/mute.entity.ts` |
| UsersService | `src/modules/users/users.service.ts` |
| UsersController | `src/modules/users/users.controller.ts` |
| UsersModule | `src/modules/users/users.module.ts` |
| VisibilityService | `src/modules/users/visibility.service.ts` |
| NotificationPort | `src/modules/users/notification.port.ts` |
| NoopNotificationService | `src/modules/users/noop-notification.service.ts` |
| ProfileDto | `src/modules/users/dto/profile.dto.ts` |
| UserCardDto | `src/modules/users/dto/user-card.dto.ts` |
| UpdateProfileDto | `src/modules/users/dto/update-profile.dto.ts` |
| FollowRequestDto | `src/modules/users/dto/follow-request.dto.ts` |
| CursorPageDto | `src/modules/users/dto/cursor-page.dto.ts` |
| Unit tests | `tests/unit/users/users.service.spec.ts`, `tests/unit/users/visibility.service.spec.ts` |

---

## What Posts Phase (Subtask 4) Builds On

1. **`VisibilityService`** — import `UsersModule` (which exports `VisibilityService`); call `canViewPost()` on every `GET /posts/:id` and `canViewProfile()` + `filterPostPage()` in list endpoints.
2. **`Follow`, `Block`, `Mute` entities** — available via `UsersModule`'s TypeORM export. PostsModule does NOT need to re-register them.
3. **`AuthorContext` / `PostContext` interfaces** — exported from `visibility.service.ts`; PostsService constructs `PostContext` from its `Post` entity (map `post.deletedAt`, `post.authorId`, `post.author.isPrivate`).
4. **`NotificationPort`** — PostsModule will add `notifyLike`, `notifyReply`, `notifyRepost`, `notifyMention` methods. Phase 7 unifies both sets into one real implementation.
5. **`UserCardDto`** — used in Posts responses for the `author` field; import from `users/dto/user-card.dto.ts`.
6. **Counter pattern** — `UPDATE ... SET x = x + 1` used here; Posts phase applies same pattern for `posts_count` and post engagement counters.
7. **`CursorPageDto<T>`** — reusable generic envelope; Posts phase imports and uses it for all list endpoints.
8. **Rate limit pattern** — `@RateLimit({ max: 300, windowSecs: 10800, keyPrefix: 'post' })` for post creation (spec §15).
