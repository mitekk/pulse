import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RedisService } from '../../infra/redis/redis.service';
import { Like } from './like.entity';
import { Bookmark } from './bookmark.entity';
import { Post } from '../posts/post.entity';
import { REDIS_KEY } from './viewer-flags.service';
import { CursorUtil } from '../../common/utils/cursor.util';
import { PostViewerDto, PostDto, PostAuthorDto } from '../posts/dto/post.dto';
import type { UserCardDto } from '../users/dto/user-card.dto';
import { POSTS_NOTIFICATION_PORT, PostsNotificationPort } from '../posts/posts-notification.port';

/**
 * EngagementService — handles likes, bookmarks, counter management, and
 * the viewer-flag queries exposed by EngagementController.
 *
 * All counter mutations use direct SQL (no read-modify-write) to avoid race conditions.
 * Redis operations adjust the per-user sets and counters hash atomically.
 */
@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Bookmark)
    private readonly bookmarkRepo: Repository<Bookmark>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    @Inject(POSTS_NOTIFICATION_PORT)
    private readonly notificationPort: PostsNotificationPort,
  ) {}

  // ── Like toggle ──────────────────────────────────────────────────────────────

  /**
   * Like a post. Idempotent — if already liked, returns current state.
   * Updates denorm counter on posts transactionally.
   * Adjusts liked:{userId} Redis set.
   * Notifies post author (no self-notify).
   */
  async like(userId: string, postId: string): Promise<{ liked: boolean; count: number }> {
    const post = await this.assertPostExists(postId);

    // Check if already liked
    const existing = await this.likeRepo.findOne({ where: { userId, postId } });
    if (existing) {
      return { liked: true, count: post.likeCount };
    }

    // Transactional: insert like + increment counter
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Like, manager.create(Like, { userId, postId }));
      await manager.query(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [postId]);
    });

    // Adjust Redis set + counter hash (best-effort outside transaction)
    const redis = this.redisService.client;
    await redis
      .pipeline()
      .sadd(REDIS_KEY.liked(userId), postId)
      .hincrby(`counters:${postId}`, 'likes', 1)
      .exec()
      .catch((e) => this.logger.warn(`Redis like update failed: ${String(e)}`));

    // Notify post author (no self-notify)
    if (post.authorId !== userId) {
      void this.notificationPort
        .notifyLike(userId, post.authorId, postId)
        .catch((e) => this.logger.warn(`notifyLike failed: ${String(e)}`));
    }

    return { liked: true, count: post.likeCount + 1 };
  }

  /**
   * Unlike a post. Idempotent — if not liked, returns current state.
   * Counter floors at 0.
   */
  async unlike(userId: string, postId: string): Promise<{ liked: boolean; count: number }> {
    const post = await this.assertPostExists(postId);

    const existing = await this.likeRepo.findOne({ where: { userId, postId } });
    if (!existing) {
      return { liked: false, count: post.likeCount };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Like, { userId, postId });
      await manager.query(
        `UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
        [postId],
      );
    });

    // Adjust Redis (best-effort)
    const redis = this.redisService.client;
    await redis
      .pipeline()
      .srem(REDIS_KEY.liked(userId), postId)
      .hincrby(`counters:${postId}`, 'likes', -1)
      .exec()
      .catch((e) => this.logger.warn(`Redis unlike update failed: ${String(e)}`));

    return { liked: false, count: Math.max(post.likeCount - 1, 0) };
  }

  // ── Bookmark toggle ──────────────────────────────────────────────────────────

  /**
   * Bookmark a post. Idempotent. Private — no notification.
   * Updates denorm counter on posts transactionally.
   */
  async bookmark(userId: string, postId: string): Promise<{ bookmarked: boolean }> {
    await this.assertPostExists(postId);

    const existing = await this.bookmarkRepo.findOne({ where: { userId, postId } });
    if (existing) {
      return { bookmarked: true };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Bookmark, manager.create(Bookmark, { userId, postId }));
      await manager.query(`UPDATE posts SET bookmark_count = bookmark_count + 1 WHERE id = $1`, [
        postId,
      ]);
    });

    // Adjust Redis (best-effort)
    const redis = this.redisService.client;
    await redis
      .pipeline()
      .sadd(REDIS_KEY.bookmarked(userId), postId)
      .hincrby(`counters:${postId}`, 'bookmarks', 1)
      .exec()
      .catch((e) => this.logger.warn(`Redis bookmark update failed: ${String(e)}`));

    return { bookmarked: true };
  }

  /**
   * Unbookmark a post. Idempotent. Counter floors at 0.
   */
  async unbookmark(userId: string, postId: string): Promise<{ bookmarked: boolean }> {
    await this.assertPostExists(postId);

    const existing = await this.bookmarkRepo.findOne({ where: { userId, postId } });
    if (!existing) {
      return { bookmarked: false };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Bookmark, { userId, postId });
      await manager.query(
        `UPDATE posts SET bookmark_count = GREATEST(bookmark_count - 1, 0) WHERE id = $1`,
        [postId],
      );
    });

    // Adjust Redis (best-effort)
    const redis = this.redisService.client;
    await redis
      .pipeline()
      .srem(REDIS_KEY.bookmarked(userId), postId)
      .hincrby(`counters:${postId}`, 'bookmarks', -1)
      .exec()
      .catch((e) => this.logger.warn(`Redis unbookmark update failed: ${String(e)}`));

    return { bookmarked: false };
  }

  // ── GET /posts/:id/likes ──────────────────────────────────────────────────────

  /**
   * Cursor-paginated list of users who liked a post.
   * Cursor based on likes.created_at (newest first by like time — stable keyset).
   */
  async getLikes(
    postId: string,
    _viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: UserCardDto[]; cursor: string | null; hasMore: boolean }> {
    await this.assertPostExists(postId);

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.likeRepo
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.user', 'u')
      .where('l.post_id = :postId', { postId });

    // Cursor pagination by user_id (stable, since PK is composite user_id + post_id)
    if (afterIdStr) {
      qb.andWhere('l.user_id > :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('l.user_id', 'ASC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items: UserCardDto[] = page.map((r) => ({
      id: r.user.id,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatarUrl: null,
      isVerified: r.user.isVerified,
      isPrivate: r.user.isPrivate,
    }));

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].userId) : null;

    return { items, cursor: nextCursor, hasMore };
  }

  // ── GET /api/v1/bookmarks (self) ──────────────────────────────────────────────

  /**
   * Cursor-paginated list of the viewer's bookmarked posts.
   * Returns PostDto pages. Only accessible by the owner.
   */
  async getBookmarks(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.bookmarkRepo
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.post', 'p')
      .innerJoinAndSelect('p.author', 'author')
      .where('b.user_id = :userId AND p.deleted_at IS NULL', { userId });

    if (afterIdStr) {
      qb.andWhere('b.post_id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('b.post_id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items: PostDto[] = page.map((b) => this.bookmarkToPostDto(b.post, userId));

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].postId) : null;

    return { items, cursor: nextCursor, hasMore };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async assertPostExists(postId: string): Promise<Post> {
    const post = await this.postRepo.findOne({ where: { id: postId }, withDeleted: false });
    if (!post) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }
    return post;
  }

  /**
   * Minimal PostDto for bookmarks list — no entity extraction to keep it fast.
   * Phase 8 can add full entity hydration via cache.
   */
  private bookmarkToPostDto(post: Post, _viewerId: string): PostDto {
    const author: PostAuthorDto = {
      id: post.author.id,
      handle: post.author.handle,
      displayName: post.author.displayName,
      avatarUrl: null,
      isVerified: post.author.isVerified,
      isPrivate: post.author.isPrivate,
    };

    const viewer: PostViewerDto = { liked: false, reposted: false, bookmarked: true };

    return {
      id: post.id,
      author,
      text: post.text,
      createdAt: post.createdAt.toISOString(),
      entities: { mentions: [], hashtags: [], urls: [] },
      media: [],
      counts: {
        replies: post.replyCount,
        reposts: post.repostCount,
        likes: post.likeCount,
        bookmarks: post.bookmarkCount,
      },
      viewer,
      replyToId: post.replyToId,
      replyPolicy: post.replyPolicy,
      quoteOf: null,
      repostOf: null,
      repostedBy: null,
      deleted: false,
    };
  }
}
