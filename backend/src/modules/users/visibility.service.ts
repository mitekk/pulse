import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Block } from './block.entity';
import { Follow } from './follow.entity';
import { Mute } from './mute.entity';

/**
 * Minimal author shape needed by VisibilityService.
 * PostsService passes a real Post entity; the author fields are projected here.
 */
export interface AuthorContext {
  id: string;
  isPrivate: boolean;
  deletedAt?: Date | null;
}

/**
 * Minimal post shape needed by VisibilityService.
 * Full PostDto is not available here (PostsModule is a peer module);
 * callers project what's needed.
 */
export interface PostContext {
  authorId: string;
  author: AuthorContext;
  deletedAt?: Date | null;
}

export type VisibilityResult =
  | { visible: true }
  | { visible: false; reason: 'blocked' | 'private' | 'deleted' };

/**
 * VisibilityService — central visibility gate for profiles and posts.
 *
 * Implements spec §3.6 rules:
 *   1. Block (either direction) → hidden (profile/posts both hidden).
 *   2. Private account + viewer is not an active follower (and not the author) → hidden.
 *   3. Soft-deleted post → tombstone visible (deleted: true, text: null) but in threads
 *      and timelines it is filtered unless caller explicitly wants tombstones.
 *   4. Muted user → visible on direct visit, suppressed from home timeline (caller decides).
 *
 * Exported for injection into PostsModule, TimelineModule, SearchModule, etc.
 */
@Injectable()
export class VisibilityService {
  constructor(
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Mute)
    private readonly muteRepo: Repository<Mute>,
  ) {}

  // ─── Profile visibility ────────────────────────────────────────────────────

  /**
   * Can `viewerId` (or anonymous if null) view the profile of `author`?
   *
   * Returns { visible: true } or { visible: false, reason }.
   * Does NOT check soft-delete on user (deactivated accounts are a separate concept).
   */
  async canViewProfile(viewerId: string | null, author: AuthorContext): Promise<VisibilityResult> {
    // Self-view always allowed
    if (viewerId !== null && viewerId === author.id) {
      return { visible: true };
    }

    // Block in either direction → hidden
    if (viewerId !== null) {
      const blocked = await this.isBlocked(viewerId, author.id);
      if (blocked) return { visible: false, reason: 'blocked' };
    }

    // Private account + not an active follower
    if (author.isPrivate) {
      if (viewerId === null) return { visible: false, reason: 'private' };
      const follows = await this.isActiveFollower(viewerId, author.id);
      if (!follows) return { visible: false, reason: 'private' };
    }

    return { visible: true };
  }

  // ─── Post visibility ───────────────────────────────────────────────────────

  /**
   * Can `viewerId` (or anonymous) view `post`?
   *
   * Soft-deleted posts return { visible: true } — the caller decides whether
   * to render a tombstone or filter entirely. This lets thread ancestors survive.
   * Pass `suppressDeleted: true` to suppress deleted posts from lists/timelines.
   */
  async canViewPost(
    viewerId: string | null,
    post: PostContext,
    opts: { suppressDeleted?: boolean } = {},
  ): Promise<VisibilityResult> {
    // Author's own posts always visible to themselves
    if (viewerId !== null && viewerId === post.authorId) {
      return { visible: true };
    }

    // Soft-deleted post
    if (post.deletedAt != null) {
      if (opts.suppressDeleted) return { visible: false, reason: 'deleted' };
      return { visible: true }; // tombstone — caller renders appropriately
    }

    // Block either direction
    if (viewerId !== null) {
      const blocked = await this.isBlocked(viewerId, post.authorId);
      if (blocked) return { visible: false, reason: 'blocked' };
    }

    // Private author + viewer not an active follower
    if (post.author.isPrivate) {
      if (viewerId === null) return { visible: false, reason: 'private' };
      const follows = await this.isActiveFollower(viewerId, post.authorId);
      if (!follows) return { visible: false, reason: 'private' };
    }

    return { visible: true };
  }

  // ─── Batch helper ─────────────────────────────────────────────────────────

  /**
   * Filter a page of posts, returning only those visible to `viewerId`.
   * Deleted posts are included as tombstones unless `suppressDeleted` is true.
   *
   * To avoid N+1 queries, we bulk-load all block/follow relationships for
   * the unique set of author IDs in the page, then evaluate rules in-memory.
   */
  async filterPostPage<T extends PostContext>(
    viewerId: string | null,
    posts: T[],
    opts: { suppressDeleted?: boolean } = {},
  ): Promise<T[]> {
    if (posts.length === 0) return [];

    const authorIds = [...new Set(posts.map((p) => p.authorId))];

    // Bulk-load blocks, mutes, and follows for all authors in this page
    const [blockedSet, followerSet] = await Promise.all([
      viewerId !== null ? this.bulkIsBlocked(viewerId, authorIds) : new Set<string>(),
      viewerId !== null ? this.bulkIsActiveFollower(viewerId, authorIds) : new Set<string>(),
    ]);
    // Muted users: visible on direct profile visit; suppressed from home timeline.
    // TimelineService calls isMuted() separately — no need to filter here.

    return posts.filter((post) => {
      // Author's own posts always visible to themselves
      if (viewerId !== null && post.authorId === viewerId) return true;

      // Suppress deleted posts from list views if requested
      if (post.deletedAt != null && opts.suppressDeleted) return false;

      // Block either direction
      if (blockedSet.has(post.authorId)) return false;

      // Private author + viewer not an active follower
      if (post.author.isPrivate) {
        if (viewerId === null) return false;
        if (!followerSet.has(post.authorId)) return false;
      }

      return true;
    });
  }

  /**
   * Is `viewerId` muted by or muting `authorId`?
   * Muted = visible on direct visit but suppressed from home timeline.
   * Callers (TimelineService) use this to decide whether to include the post.
   */
  async isMuted(viewerId: string, authorId: string): Promise<boolean> {
    const mute = await this.muteRepo.findOne({
      where: { muterId: viewerId, mutedId: authorId },
    });
    return mute !== null;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** True if there is a block row in either direction between the two users. */
  async isBlocked(viewerId: string, authorId: string): Promise<boolean> {
    const count = await this.blockRepo
      .createQueryBuilder('b')
      .where(
        '(b.blocker_id = :a AND b.blocked_id = :b) OR (b.blocker_id = :b AND b.blocked_id = :a)',
        { a: viewerId, b: authorId },
      )
      .getCount();
    return count > 0;
  }

  /** True if `viewerId` actively follows `authorId` (state = 'active'). */
  async isActiveFollower(viewerId: string, authorId: string): Promise<boolean> {
    const follow = await this.followRepo.findOne({
      where: { followerId: viewerId, followeeId: authorId, state: 'active' },
    });
    return follow !== null;
  }

  /**
   * Batch: returns the set of authorIds that are blocked (either direction)
   * relative to `viewerId`.
   */
  private async bulkIsBlocked(viewerId: string, authorIds: string[]): Promise<Set<string>> {
    if (authorIds.length === 0) return new Set();
    const rows = await this.blockRepo
      .createQueryBuilder('b')
      .select('b.blocker_id', 'blocker')
      .addSelect('b.blocked_id', 'blocked')
      .where(
        '(b.blocker_id = :v AND b.blocked_id = ANY(:ids)) OR (b.blocked_id = :v AND b.blocker_id = ANY(:ids))',
        { v: viewerId, ids: authorIds },
      )
      .getRawMany<{ blocker: string; blocked: string }>();

    const result = new Set<string>();
    for (const row of rows) {
      // Add whichever side is the author
      if (authorIds.includes(row.blocker)) result.add(row.blocker);
      if (authorIds.includes(row.blocked)) result.add(row.blocked);
    }
    return result;
  }

  /**
   * Batch: returns the set of authorIds that `viewerId` is muting.
   */
  private async bulkIsMuted(viewerId: string, authorIds: string[]): Promise<Set<string>> {
    if (authorIds.length === 0) return new Set();
    const rows = await this.muteRepo
      .createQueryBuilder('m')
      .select('m.muted_id', 'mutedId')
      .where('m.muter_id = :v AND m.muted_id = ANY(:ids)', { v: viewerId, ids: authorIds })
      .getRawMany<{ mutedId: string }>();
    return new Set(rows.map((r) => r.mutedId));
  }

  /**
   * Batch: returns the set of authorIds that `viewerId` actively follows.
   */
  private async bulkIsActiveFollower(viewerId: string, authorIds: string[]): Promise<Set<string>> {
    if (authorIds.length === 0) return new Set();
    const rows = await this.followRepo
      .createQueryBuilder('f')
      .select('f.followee_id', 'followeeId')
      .where('f.follower_id = :v AND f.followee_id = ANY(:ids) AND f.state = :state', {
        v: viewerId,
        ids: authorIds,
        state: 'active',
      })
      .getRawMany<{ followeeId: string }>();
    return new Set(rows.map((r) => r.followeeId));
  }
}
