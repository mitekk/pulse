import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReplyPolicy } from '../post.entity';

/**
 * CreatePostDto — request body for POST /api/v1/posts.
 *
 * Validation notes:
 * - text is optional — empty posts are allowed only if mediaIds is non-empty OR
 *   this is a pure repost (repostOfId set, no text/media). That semantic check
 *   is enforced in PostsService, not here.
 * - Text length is counted in CODEPOINTS in PostsService (URLs counted as 23).
 * - Max codepoint limit: 280 (spec §3.1). We allow a generous @MaxLength for the
 *   raw string here; the real limit is checked after URL substitution in the service.
 */
export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000) // generous raw limit; real limit enforced in service after URL normalization
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString()
  quoteOfId?: string;

  @IsOptional()
  @IsIn(['everyone', 'following', 'mentioned'])
  replyPolicy?: ReplyPolicy;
}
