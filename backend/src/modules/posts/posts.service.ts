import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Post, ReplyPolicy } from './post.entity';
import { Mention } from './mention.entity';
import { Hashtag } from './hashtag.entity';
import { PostHashtag } from './post-hashtag.entity';
import { User } from '../users/user.entity';
import { VisibilityService } from '../users/visibility.service';
import { EntityExtractorService, ExtractedEntities } from './entity-extractor.service';
import { POSTS_NOTIFICATION_PORT, PostsNotificationPort } from './posts-notification.port';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { CursorUtil } from '../../common/utils/cursor.util';
import { CreatePostDto } from './dto/create-post.dto';
import {
  PostAuthorDto,
  PostDto,
  PostCountsDto,
  PostViewerDto,
  ShallowPostDto,
} from './dto/post.dto';
import type { UserCardDto } from '../users/dto/user-card.dto';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Twitter-style fixed length for any URL in post text */
const URL_DISPLAY_LENGTH = 23;

/** Max post length in codepoints after URL normalization */
const MAX_POST_LENGTH = 280;

/** URL pattern for length-counting (same regex as entity extractor) */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

// ── Helper: text length in codepoints (URLs counted as 23) ───────────────────

/**
 * Count post length in codepoints, replacing each URL with a fixed-width token.
 * This matches the frontend character counter algorithm.
 */
export function countPostLength(text: string): number {
  const normalized = text.replace(URL_RE, (_url) => 'x'.repeat(URL_DISPLAY_LENGTH));
  return [...normalized].length; // spread = iterate by Unicode codepoint
}

// ── Helper: map User to PostAuthorDto ─────────────────────────────────────────

function toAuthorDto(user: User): PostAuthorDto {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: null, // populated in Phase 6 when media is attached
    isVerified: user.isVerified,
    isPrivate: user.isPrivate,
  };
}

// ── Helper: map Post entity to PostDto ────────────────────────────────────────

function toPostDto(
  post: Post,
  entities: ExtractedEntities,
  viewer: PostViewerDto,
  quoteOf: ShallowPostDto | null = null,
  repostOf: ShallowPostDto | null = null,
  repostedBy: { handle: string; displayName: string } | null = null,
): PostDto {
  const counts: PostCountsDto = {
    replies: post.replyCount,
    reposts: post.repostCount,
    likes: post.likeCount,
    bookmarks: post.bookmarkCount,
  };

  return {
    id: post.id,
    author: toAuthorDto(post.author),
    text: post.deletedAt ? null : post.text,
    createdAt: post.createdAt.toISOString(),
    entities: post.deletedAt ? { mentions: [], hashtags: [], urls: [] } : entities,
    media: [], // populated in Phase 6
    counts,
    viewer,
    replyToId: post.replyToId,
    replyPolicy: post.replyPolicy,
    quoteOf,
    repostOf,
    repostedBy,
    deleted: post.deletedAt !== null,
  };
}

function toShallowDto(post: Post, entities: ExtractedEntities): ShallowPostDto {
  return {
    id: post.id,
    author: toAuthorDto(post.author),
    text: post.deletedAt ? null : post.text,
    createdAt: post.createdAt.toISOString(),
    entities,
    counts: {
      replies: post.replyCount,
      reposts: post.repostCount,
      likes: post.likeCount,
      bookmarks: post.bookmarkCount,
    },
    replyToId: post.replyToId,
    replyPolicy: post.replyPolicy,
    deleted: post.deletedAt !== null,
  };
}

// ── PostsService ──────────────────────────────────────────────────────────────

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Mention)
    private readonly mentionRepo: Repository<Mention>,
    @InjectRepository(Hashtag)
    private readonly hashtagRepo: Repository<Hashtag>,
    @InjectRepository(PostHashtag)
    private readonly postHashtagRepo: Repository<PostHashtag>,
    private readonly dataSource: DataSource,
    private readonly visibilityService: VisibilityService,
    private readonly entityExtractor: EntityExtractorService,
    @Inject(POSTS_NOTIFICATION_PORT)
    private readonly notificationPort: PostsNotificationPort,
    @InjectQueue('fanout')
    private readonly fanoutQueue: Queue,
    @InjectQueue('search')
    private readonly searchQueue: Queue,
  ) {}

  // ── create ─────────────────────────────────────────────────────────────────

  async create(authorId: string, dto: CreatePostDto): Promise<PostDto> {
    const { text, mediaIds = [], replyToId, quoteOfId, replyPolicy = 'everyone' } = dto;

    // ── Text length validation ───────────────────────────────────────────────
    // Empty text is only allowed with media OR as a pure repost (no text, no media)
    // Pure repost handled by separate repost() method — create() always needs text or media
    if (!text && mediaIds.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'EMPTY_POST',
          message: 'Post text or media is required',
        },
      });
    }

    if (text) {
      const len = countPostLength(text);
      if (len > MAX_POST_LENGTH) {
        throw new BadRequestException({
          error: {
            code: 'POST_TOO_LONG',
            message: `Post exceeds ${MAX_POST_LENGTH} characters (${len} counted after URL normalization)`,
          },
        });
      }
    }

    // ── Load parent post for reply ────────────────────────────────────────
    let parentPost: Post | null = null;
    if (replyToId) {
      parentPost = await this.postRepo.findOne({
        where: { id: replyToId },
        relations: { author: true },
        withDeleted: false,
      });
      if (!parentPost) {
        throw new NotFoundException({
          error: { code: 'POST_NOT_FOUND', message: 'Reply target post not found' },
        });
      }
      await this.enforceReplyPolicy(authorId, parentPost);
    }

    // ── Load quote target ─────────────────────────────────────────────────
    let quotePost: Post | null = null;
    if (quoteOfId) {
      quotePost = await this.postRepo.findOne({
        where: { id: quoteOfId },
        relations: { author: true },
        withDeleted: false,
      });
      if (!quotePost) {
        throw new NotFoundException({
          error: { code: 'POST_NOT_FOUND', message: 'Quote target post not found' },
        });
      }
    }

    // ── Generate Snowflake ID ─────────────────────────────────────────────
    const id = SnowflakeUtil.instance.generate();

    // ── Determine conversation_id / reply_root_id ─────────────────────────
    let conversationId: string | null = null;
    let replyRootId: string | null = null;

    if (parentPost) {
      conversationId = parentPost.conversationId ?? parentPost.id;
      replyRootId = parentPost.replyRootId ?? parentPost.id;
    }

    // ── Transactional write ───────────────────────────────────────────────
    let savedPost!: Post;
    let entities!: ExtractedEntities;

    await this.dataSource.transaction(async (manager) => {
      const post = manager.create(Post, {
        id,
        authorId,
        text: text ?? null,
        replyToId: replyToId ?? null,
        replyRootId,
        conversationId,
        repostOfId: null,
        quoteOfId: quoteOfId ?? null,
        replyPolicy,
      });

      savedPost = await manager.save(Post, post);

      const author = await manager.findOneOrFail(User, { where: { id: authorId } });
      savedPost.author = author;

      entities = await this.entityExtractor.extractAndPersist(id, text ?? null);

      if (replyToId) {
        await manager.query(`UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`, [
          replyToId,
        ]);
      }

      if (quoteOfId) {
        await manager.query(`UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1`, [
          quoteOfId,
        ]);
      }

      await manager.query(`UPDATE users SET posts_count = posts_count + 1 WHERE id = $1`, [
        authorId,
      ]);
    });

    // ── Notifications (outside transaction, best-effort) ──────────────────
    if (parentPost && parentPost.authorId !== authorId) {
      void this.notificationPort
        .notifyReply(authorId, parentPost.authorId, id)
        .catch((e) => this.logger.warn(`notifyReply failed: ${String(e)}`));
    }

    if (quotePost && quotePost.authorId !== authorId) {
      void this.notificationPort
        .notifyQuote(authorId, quotePost.authorId, id)
        .catch((e) => this.logger.warn(`notifyQuote failed: ${String(e)}`));
    }

    for (const mention of entities.mentions) {
      if (mention.userId !== authorId) {
        void this.notificationPort
          .notifyMention(authorId, mention.userId, id)
          .catch((e) => this.logger.warn(`notifyMention failed: ${String(e)}`));
      }
    }

    // ── Enqueue fanout + search jobs ──────────────────────────────────────
    await this.fanoutQueue
      .add('fanout.post', { postId: id, authorId }, { jobId: `fanout:${id}` })
      .catch((e) => this.logger.warn(`fanout job enqueue failed: ${String(e)}`));

    await this.searchQueue
      .add('search.index', { postId: id, action: 'upsert' }, { jobId: `search:${id}` })
      .catch((e) => this.logger.warn(`search job enqueue failed: ${String(e)}`));

    // ── Build and return PostDto ───────────────────────────────────────────
    const viewerDto: PostViewerDto = { liked: false, reposted: false, bookmarked: false };

    let quoteOfDto: ShallowPostDto | null = null;
    if (quotePost) {
      const qEntities = await this.entityExtractor.extractAndPersist(quotePost.id, quotePost.text);
      quoteOfDto = toShallowDto(quotePost, qEntities);
    }

    return toPostDto(savedPost, entities, viewerDto, quoteOfDto, null, null);
  }

  // ── repost (toggle) ────────────────────────────────────────────────────────

  /**
   * POST /posts/:id/repost — idempotent toggle.
   * Pure repost: no text, no media. Protected by UNIQUE(author_id, repost_of_id).
   */
  async repost(
    authorId: string,
    originalPostId: string,
  ): Promise<{ reposted: boolean; count: number }> {
    const original = await this.postRepo.findOne({
      where: { id: originalPostId },
      relations: { author: true },
      withDeleted: false,
    });
    if (!original) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }

    const existing = await this.postRepo.findOne({
      where: { authorId, repostOfId: originalPostId },
      withDeleted: true,
    });

    if (existing && !existing.deletedAt) {
      // Already reposted — idempotent return
      return { reposted: true, count: original.repostCount };
    }

    if (existing && existing.deletedAt) {
      // Restore a previously un-reposted row
      await this.dataSource.transaction(async (manager) => {
        await manager.restore(Post, existing.id);
        await manager.query(`UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1`, [
          originalPostId,
        ]);
        await manager.query(`UPDATE users SET posts_count = posts_count + 1 WHERE id = $1`, [
          authorId,
        ]);
      });
      return { reposted: true, count: original.repostCount + 1 };
    }

    // Create new repost
    const id = SnowflakeUtil.instance.generate();

    await this.dataSource.transaction(async (manager) => {
      const repost = manager.create(Post, {
        id,
        authorId,
        text: null,
        repostOfId: originalPostId,
      });
      await manager.save(Post, repost);

      await manager.query(`UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1`, [
        originalPostId,
      ]);
      await manager.query(`UPDATE users SET posts_count = posts_count + 1 WHERE id = $1`, [
        authorId,
      ]);
    });

    if (original.authorId !== authorId) {
      void this.notificationPort
        .notifyRepost(authorId, original.authorId, originalPostId)
        .catch((e) => this.logger.warn(`notifyRepost failed: ${String(e)}`));
    }

    await this.fanoutQueue
      .add(
        'fanout.post',
        { postId: id, authorId, repostOf: originalPostId },
        { jobId: `fanout:${id}` },
      )
      .catch((e) => this.logger.warn(`fanout repost job failed: ${String(e)}`));

    return { reposted: true, count: original.repostCount + 1 };
  }

  async unrepost(
    authorId: string,
    originalPostId: string,
  ): Promise<{ reposted: boolean; count: number }> {
    const original = await this.postRepo.findOne({
      where: { id: originalPostId },
      withDeleted: false,
    });
    if (!original) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }

    const repostRow = await this.postRepo.findOne({
      where: { authorId, repostOfId: originalPostId },
      withDeleted: false,
    });

    if (!repostRow) {
      return { reposted: false, count: original.repostCount };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Post, repostRow.id);
      await manager.query(
        `UPDATE posts SET repost_count = GREATEST(repost_count - 1, 0) WHERE id = $1`,
        [originalPostId],
      );
      await manager.query(
        `UPDATE users SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = $1`,
        [authorId],
      );
    });

    return { reposted: false, count: Math.max(original.repostCount - 1, 0) };
  }

  // ── get one post ───────────────────────────────────────────────────────────

  async findOne(postId: string, viewerId: string | null): Promise<PostDto> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: { author: true },
      withDeleted: true,
    });

    if (!post) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }

    const vis = await this.visibilityService.canViewPost(viewerId, {
      authorId: post.authorId,
      author: { id: post.author.id, isPrivate: post.author.isPrivate },
      deletedAt: post.deletedAt,
    });

    if (!vis.visible) {
      if (vis.reason === 'blocked') {
        throw new ForbiddenException({
          error: { code: 'BLOCKED', message: 'Access denied' },
        });
      }
      throw new ForbiddenException({
        error: { code: 'PRIVATE_ACCOUNT', message: 'This account is private' },
      });
    }

    const entities = await this.loadEntities(postId, post.text);
    const viewerFlags = await this.loadViewerFlags(viewerId);

    let quoteOfDto: ShallowPostDto | null = null;
    if (post.quoteOfId) {
      const qPost = await this.postRepo.findOne({
        where: { id: post.quoteOfId },
        relations: { author: true },
        withDeleted: true,
      });
      if (qPost) {
        const qEnt = await this.loadEntities(qPost.id, qPost.text);
        quoteOfDto = toShallowDto(qPost, qEnt);
      }
    }

    let repostOfDto: ShallowPostDto | null = null;
    if (post.repostOfId) {
      const rPost = await this.postRepo.findOne({
        where: { id: post.repostOfId },
        relations: { author: true },
        withDeleted: true,
      });
      if (rPost) {
        const rEnt = await this.loadEntities(rPost.id, rPost.text);
        repostOfDto = toShallowDto(rPost, rEnt);
      }
    }

    return toPostDto(post, entities, viewerFlags, quoteOfDto, repostOfDto, null);
  }

  // ── soft delete ────────────────────────────────────────────────────────────

  async softDelete(postId: string, authorId: string): Promise<void> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      withDeleted: false,
    });

    if (!post) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own posts' },
      });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Post, postId);
      await manager.query(
        `UPDATE users SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = $1`,
        [authorId],
      );
    });

    await this.searchQueue
      .add('search.index', { postId, action: 'delete' }, { jobId: `search:del:${postId}` })
      .catch((e) => this.logger.warn(`search delete job failed: ${String(e)}`));
  }

  // ── thread ─────────────────────────────────────────────────────────────────

  /**
   * GET /posts/:id/thread — ancestors (path to root), focused post, ranked replies.
   * Reply ranking: author's own replies first → engagement (like_count DESC) → chrono (id ASC).
   */
  async getThread(
    postId: string,
    viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{
    ancestors: PostDto[];
    post: PostDto;
    replies: PostDto[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const focused = await this.findOne(postId, viewerId);

    // ── Ancestors: walk up the reply chain to root ────────────────────────
    const ancestors: PostDto[] = [];
    let currentId: string | null = focused.replyToId;

    while (currentId) {
      const ancestor = await this.postRepo.findOne({
        where: { id: currentId },
        relations: { author: true },
        withDeleted: true,
      });

      if (!ancestor) break;

      const vis = await this.visibilityService.canViewPost(viewerId, {
        authorId: ancestor.authorId,
        author: { id: ancestor.author.id, isPrivate: ancestor.author.isPrivate },
        deletedAt: ancestor.deletedAt,
      });

      if (vis.visible) {
        const ent = await this.loadEntities(ancestor.id, ancestor.text);
        const vf = await this.loadViewerFlags(viewerId);
        ancestors.unshift(toPostDto(ancestor, ent, vf, null, null, null));
      }

      currentId = ancestor.replyToId;
    }

    // ── Replies: ranked ───────────────────────────────────────────────────
    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.reply_to_id = :id', { id: postId })
      .andWhere('p.deleted_at IS NULL');

    if (afterIdStr) {
      qb.andWhere('p.id > :afterId', { afterId: afterIdStr });
    }

    qb.orderBy(`CASE WHEN p.author_id = :authorId THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('p.like_count', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .setParameter('authorId', focused.author.id)
      .take(limit + 1);

    const rawReplies = await qb.getMany();
    const hasMore = rawReplies.length > limit;
    const replyPage = rawReplies.slice(0, limit);

    const filtered = await this.visibilityService.filterPostPage(viewerId, replyPage, {
      suppressDeleted: false,
    });

    const replyDtos: PostDto[] = [];
    for (const r of filtered) {
      const ent = await this.loadEntities(r.id, r.text);
      const vf = await this.loadViewerFlags(viewerId);
      replyDtos.push(toPostDto(r, ent, vf, null, null, null));
    }

    const nextCursor =
      hasMore && replyPage.length > 0
        ? CursorUtil.encodeId(replyPage[replyPage.length - 1].id)
        : null;

    return {
      ancestors,
      post: focused,
      replies: replyDtos,
      cursor: nextCursor,
      hasMore,
    };
  }

  // ── list endpoints ─────────────────────────────────────────────────────────

  async getReplies(
    postId: string,
    viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    await this.assertPostExists(postId);
    return this.paginatePostList(
      this.postRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.author', 'author')
        .where('p.reply_to_id = :id AND p.deleted_at IS NULL', { id: postId })
        .orderBy('p.id', 'ASC'),
      viewerId,
      limit,
      cursor,
      'asc',
    );
  }

  async getReposts(
    postId: string,
    viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: UserCardDto[]; cursor: string | null; hasMore: boolean }> {
    await this.assertPostExists(postId);

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.repost_of_id = :id AND p.deleted_at IS NULL', { id: postId });

    if (afterIdStr) qb.andWhere('p.id > :afterId', { afterId: afterIdStr });

    qb.orderBy('p.id', 'ASC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items: UserCardDto[] = page.map((r) => ({
      id: r.author.id,
      handle: r.author.handle,
      displayName: r.author.displayName,
      avatarUrl: null,
      isVerified: r.author.isVerified,
      isPrivate: r.author.isPrivate,
    }));

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;
    return { items, cursor: nextCursor, hasMore };
  }

  async getQuotes(
    postId: string,
    viewerId: string | null,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    await this.assertPostExists(postId);
    return this.paginatePostList(
      this.postRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.author', 'author')
        .where('p.quote_of_id = :id AND p.deleted_at IS NULL', { id: postId })
        .orderBy('p.id', 'DESC'),
      viewerId,
      limit,
      cursor,
      'desc',
    );
  }

  /** Likes list is owned by EngagementModule (subtask 5); stub here for the route */
  async getLikes(
    _postId: string,
    _viewerId: string | null,
    _limit = 20,
    _cursor?: string,
  ): Promise<{ items: UserCardDto[]; cursor: string | null; hasMore: boolean }> {
    // TODO: implemented in EngagementModule (subtask 5)
    return { items: [], cursor: null, hasMore: false };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async assertPostExists(postId: string): Promise<Post> {
    const post = await this.postRepo.findOne({ where: { id: postId }, withDeleted: false });
    if (!post) {
      throw new NotFoundException({
        error: { code: 'POST_NOT_FOUND', message: 'Post not found' },
      });
    }
    return post;
  }

  private async loadEntities(postId: string, text: string | null): Promise<ExtractedEntities> {
    if (!text) return { mentions: [], hashtags: [], urls: [] };
    // Re-extract offsets from text for every read.
    // Phase 8 can cache the entity map in Redis post:{id}:entities.
    return this.entityExtractor.extractAndPersist(postId, text);
  }

  /** Load viewer engagement flags — stubs until EngagementModule (subtask 5) */
  private async loadViewerFlags(_viewerId: string | null): Promise<PostViewerDto> {
    // TODO: implemented in EngagementModule (subtask 5)
    return { liked: false, reposted: false, bookmarked: false };
  }

  /**
   * Cursor-paginated post list. direction='desc' uses id < cursor, 'asc' uses id > cursor.
   */
  private async paginatePostList(
    qb: SelectQueryBuilder<Post>,
    viewerId: string | null,
    limit: number,
    cursor?: string,
    direction: 'asc' | 'desc' = 'desc',
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    if (afterIdStr) {
      if (direction === 'desc') {
        qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
      } else {
        qb.andWhere('p.id > :afterId', { afterId: afterIdStr });
      }
    }

    qb.take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const filtered = await this.visibilityService.filterPostPage(viewerId, page, {
      suppressDeleted: true,
    });

    const items: PostDto[] = [];
    for (const p of filtered) {
      const ent = await this.loadEntities(p.id, p.text);
      const vf = await this.loadViewerFlags(viewerId);
      items.push(toPostDto(p, ent, vf, null, null, null));
    }

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;

    return { items, cursor: nextCursor, hasMore };
  }

  // ── Reply policy enforcement ───────────────────────────────────────────────

  private async enforceReplyPolicy(authorId: string, parentPost: Post): Promise<void> {
    const policy: ReplyPolicy = parentPost.replyPolicy;

    if (policy === 'everyone') return;

    if (policy === 'following') {
      if (authorId === parentPost.authorId) return;
      const isFollowing = await this.visibilityService.isActiveFollower(
        authorId,
        parentPost.authorId,
      );
      if (!isFollowing) {
        throw new ForbiddenException({
          error: {
            code: 'REPLY_POLICY_FOLLOWING',
            message: 'Only followers can reply to this post',
          },
        });
      }
    }

    if (policy === 'mentioned') {
      if (authorId === parentPost.authorId) return;
      const mention = await this.mentionRepo.findOne({
        where: { postId: parentPost.id, mentionedUserId: authorId },
      });
      if (!mention) {
        throw new ForbiddenException({
          error: {
            code: 'REPLY_POLICY_MENTIONED',
            message: 'Only mentioned users can reply to this post',
          },
        });
      }
    }
  }
}
