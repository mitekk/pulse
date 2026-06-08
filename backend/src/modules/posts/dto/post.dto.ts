import { ReplyPolicy } from '../post.entity';
import { ExtractedEntities } from '../entity-extractor.service';

/**
 * Compact author shape embedded in PostDto.
 * Matches UserCardDto from users module but inlined to avoid circular imports.
 */
export interface PostAuthorDto {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  isPrivate: boolean;
}

export interface PostCountsDto {
  replies: number;
  reposts: number;
  likes: number;
  bookmarks: number;
}

export interface PostViewerDto {
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
}

/** Shallow PostDto — no nested quoteOf/repostOf to prevent infinite recursion */
export interface ShallowPostDto {
  id: string;
  author: PostAuthorDto;
  text: string | null;
  createdAt: string;
  entities: ExtractedEntities;
  // media is included so PostCard can safely access post.media without crashing
  // when rendering a repost/quote card that embeds a ShallowPostDto.
  media: PostMediaDto[];
  counts: PostCountsDto;
  replyToId: string | null;
  replyPolicy: ReplyPolicy;
  deleted: boolean;
}

/**
 * PostDto — canonical response shape for a single post.
 * Matches the contract shape in api-contract.md exactly.
 */
export interface PostDto {
  id: string;
  author: PostAuthorDto;
  text: string | null;
  createdAt: string;
  entities: ExtractedEntities;
  media: PostMediaDto[];
  counts: PostCountsDto;
  viewer: PostViewerDto;
  replyToId: string | null;
  replyPolicy: ReplyPolicy;
  /** Populated when this post quotes another post (quoteOfId set) */
  quoteOf: ShallowPostDto | null;
  /** Populated when this IS a pure repost (repostOfId set) */
  repostOf: ShallowPostDto | null;
  /** Populated when returned via a repost feed event */
  repostedBy: { handle: string; displayName: string } | null;
  /** true = tombstone; text may be null; structure preserved for thread rendering */
  deleted: boolean;
}

export interface PostMediaDto {
  id: string;
  type: 'image' | 'gif' | 'video';
  /** Processing lifecycle — the client renders a placeholder when not 'ready'. */
  status: 'pending' | 'processing' | 'ready' | 'failed';
  variants: {
    thumb?: string;
    small?: string;
    medium?: string;
    large?: string;
    mp4?: string;
    poster?: string;
  };
  altText: string | null;
  width: number | null;
  height: number | null;
}
