import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Hashtag } from './hashtag.entity';
import { Mention } from './mention.entity';
import { PostHashtag } from './post-hashtag.entity';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { TRENDS_INCREMENT_PORT, TrendsIncrementPort } from './trends-increment.port';

// ── Public DTO shapes (returned by extractAndPersist) ────────────────────────

export interface MentionEntity {
  handle: string;
  userId: string;
  start: number;
  end: number;
}

export interface HashtagEntity {
  tag: string;
  start: number;
  end: number;
}

export interface UrlEntity {
  url: string;
  displayUrl: string;
  start: number;
  end: number;
}

export interface ExtractedEntities {
  mentions: MentionEntity[];
  hashtags: HashtagEntity[];
  urls: UrlEntity[];
}

/**
 * URL display-text helper — strips scheme and truncates long URLs.
 * Matches Twitter's display URL style (show up to 23 visual chars).
 */
function toDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').slice(0, 30);
}

/**
 * EntityExtractorService — single-pass extraction of @mentions, #hashtags,
 * and URLs from post text. Resolves mention handles → user IDs, upserts
 * hashtag rows, writes mentions + post_hashtags, returns entity offsets.
 *
 * Offsets are CODEPOINT positions (not byte offsets), matching what the
 * frontend character counter uses.
 */
@Injectable()
export class EntityExtractorService {
  /** Matches @handle — handles start with a letter/digit and continue alphanumeric + underscore */
  private static readonly MENTION_RE = /@([a-z0-9_]{1,50})/gi;
  /** Matches #hashtag */
  private static readonly HASHTAG_RE = /#([a-z0-9_]{1,100})/gi;
  /** Simplified URL matcher — covers http(s) links */
  private static readonly URL_RE = /https?:\/\/[^\s<>"']+/gi;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Hashtag)
    private readonly hashtagRepo: Repository<Hashtag>,
    @InjectRepository(Mention)
    private readonly mentionRepo: Repository<Mention>,
    @InjectRepository(PostHashtag)
    private readonly postHashtagRepo: Repository<PostHashtag>,
    private readonly dataSource: DataSource,
    @Inject(TRENDS_INCREMENT_PORT)
    private readonly trendsIncrement: TrendsIncrementPort,
  ) {}

  /**
   * Extract entities from `text`, persist mention + hashtag rows for `postId`,
   * and return the structured entity map for the PostDto.
   *
   * Must be called inside a transaction or as part of the post-create transaction.
   */
  async extractAndPersist(postId: string, text: string | null): Promise<ExtractedEntities> {
    if (!text) {
      return { mentions: [], hashtags: [], urls: [] };
    }

    // Convert text to codepoint array for accurate offset calculation
    const codepoints = [...text]; // spread splits by Unicode code point

    const rawMentions = this.extractMentions(codepoints, text);
    const rawHashtags = this.extractHashtags(codepoints, text);
    const rawUrls = this.extractUrls(codepoints, text);

    // ── Resolve handles → user IDs ─────────────────────────────────────────
    const uniqueHandles = [...new Set(rawMentions.map((m) => m.handle.toLowerCase()))];
    const mentionEntities: MentionEntity[] = [];

    if (uniqueHandles.length > 0) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.handle'])
        .where('LOWER(u.handle) = ANY(:handles)', { handles: uniqueHandles })
        .getMany();

      const handleToId = new Map(users.map((u) => [u.handle.toLowerCase(), u.id]));

      for (const raw of rawMentions) {
        const userId = handleToId.get(raw.handle.toLowerCase());
        if (!userId) continue; // Unknown handle — skip (don't error)
        mentionEntities.push({ handle: raw.handle, userId, start: raw.start, end: raw.end });
      }

      // Persist mention rows (unique by post_id + mentioned_user_id)
      if (mentionEntities.length > 0) {
        const uniqueMentions = this.deduplicateMentions(mentionEntities);
        const mentionRows = uniqueMentions.map((m) => {
          const row = new Mention();
          row.postId = postId;
          row.mentionedUserId = m.userId;
          return row;
        });
        // INSERT ... ON CONFLICT DO NOTHING — idempotent if called twice
        await this.dataSource
          .createQueryBuilder()
          .insert()
          .into(Mention)
          .values(mentionRows)
          .orIgnore()
          .execute();
      }
    }

    // ── Upsert hashtags + write post_hashtags ──────────────────────────────
    const hashtagEntities: HashtagEntity[] = [];
    const uniqueTags = [...new Set(rawHashtags.map((h) => h.tag.toLowerCase()))];

    if (uniqueTags.length > 0) {
      const hashtagIds: string[] = [];

      for (const tag of uniqueTags) {
        // Upsert: insert if not exists, returning the id
        const existing = await this.hashtagRepo
          .createQueryBuilder('h')
          .select(['h.id', 'h.tag'])
          .where('LOWER(h.tag) = :tag', { tag })
          .getOne();

        let hashtagId: string;
        if (existing) {
          hashtagId = existing.id;
        } else {
          hashtagId = SnowflakeUtil.instance.generate();
          const newHashtag = new Hashtag();
          newHashtag.id = hashtagId;
          newHashtag.tag = tag;
          await this.hashtagRepo.save(newHashtag);
        }
        hashtagIds.push(hashtagId);
      }

      // Write post_hashtags
      const postHashtagRows = hashtagIds.map((hashtagId) => {
        const row = new PostHashtag();
        row.postId = postId;
        row.hashtagId = hashtagId;
        return row;
      });
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(PostHashtag)
        .values(postHashtagRows)
        .orIgnore()
        .execute();

      // Map back to raw hashtag entries with offsets
      for (const raw of rawHashtags) {
        hashtagEntities.push({ tag: raw.tag.toLowerCase(), start: raw.start, end: raw.end });
      }

      // ── Increment trending counters (fire-and-forget; non-blocking) ──────
      // TrendsIncrementPort is a no-op in tests / when HashtagsModule is absent.
      // In production, AppModule overrides with TrendsService.incrementTags().
      const tagsToIncrement = [...new Set(rawHashtags.map((h) => h.tag.toLowerCase()))];
      void this.trendsIncrement.incrementTags(tagsToIncrement).catch(() => {
        // Trending counters are best-effort; never fail the post-create transaction
      });
    }

    // ── Dedup URL entities (same URL at multiple positions) ───────────────
    const urlEntities: UrlEntity[] = rawUrls.map((r) => ({
      url: r.url,
      displayUrl: toDisplayUrl(r.url),
      start: r.start,
      end: r.end,
    }));

    return {
      mentions: mentionEntities,
      hashtags: hashtagEntities,
      urls: urlEntities,
    };
  }

  // ── Internal extraction helpers (operate on codepoint array) ──────────────

  private extractMentions(
    codepoints: string[],
    text: string,
  ): Array<{ handle: string; start: number; end: number }> {
    const results: Array<{ handle: string; start: number; end: number }> = [];
    const re = new RegExp(EntityExtractorService.MENTION_RE.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const byteStart = match.index;
      const byteEnd = byteStart + match[0].length;
      const cpStart = this.byteOffsetToCodepointOffset(codepoints, byteStart);
      const cpEnd = this.byteOffsetToCodepointOffset(codepoints, byteEnd);
      results.push({ handle: match[1], start: cpStart, end: cpEnd });
    }
    return results;
  }

  private extractHashtags(
    codepoints: string[],
    text: string,
  ): Array<{ tag: string; start: number; end: number }> {
    const results: Array<{ tag: string; start: number; end: number }> = [];
    const re = new RegExp(EntityExtractorService.HASHTAG_RE.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const byteStart = match.index;
      const byteEnd = byteStart + match[0].length;
      const cpStart = this.byteOffsetToCodepointOffset(codepoints, byteStart);
      const cpEnd = this.byteOffsetToCodepointOffset(codepoints, byteEnd);
      results.push({ tag: match[1], start: cpStart, end: cpEnd });
    }
    return results;
  }

  private extractUrls(
    codepoints: string[],
    text: string,
  ): Array<{ url: string; start: number; end: number }> {
    const results: Array<{ url: string; start: number; end: number }> = [];
    const re = new RegExp(EntityExtractorService.URL_RE.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const byteStart = match.index;
      const byteEnd = byteStart + match[0].length;
      const cpStart = this.byteOffsetToCodepointOffset(codepoints, byteStart);
      const cpEnd = this.byteOffsetToCodepointOffset(codepoints, byteEnd);
      results.push({ url: match[0], start: cpStart, end: cpEnd });
    }
    return results;
  }

  /**
   * Convert a JS string byte offset (from RegExp.exec) to a codepoint offset.
   *
   * text.length counts UTF-16 code units; [...text] splits by codepoint.
   * For BMP-only text these are identical. For emoji/supplementary chars
   * they differ (one codepoint = two UTF-16 units).
   *
   * We reconstruct the mapping by rebuilding the string codepoint-by-codepoint
   * and tracking the running byte length.
   */
  private byteOffsetToCodepointOffset(codepoints: string[], byteOffset: number): number {
    let byteLen = 0;
    for (let i = 0; i < codepoints.length; i++) {
      if (byteLen >= byteOffset) return i;
      byteLen += codepoints[i].length; // JS string length = UTF-16 code units
    }
    return codepoints.length;
  }

  /** Remove duplicate (same userId) mentions — keep first occurrence */
  private deduplicateMentions(mentions: MentionEntity[]): MentionEntity[] {
    const seen = new Set<string>();
    return mentions.filter((m) => {
      if (seen.has(m.userId)) return false;
      seen.add(m.userId);
      return true;
    });
  }
}
