import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { SearchService } from './search.service';

interface AuthUser {
  id: string;
  handle: string;
  sessionId: string;
}

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /api/v1/search?q=&type=top|latest|people|media&cursor=&limit=
   *
   * Rate limit: 60 requests / 60 seconds (per user or IP).
   *
   * Query parsing:
   *   - #tag    → redirects to hashtag timeline
   *   - @handle → single user lookup
   *   - `from:handle` bare terms → FTS with from-filter ([NICE])
   *   - bare terms → FTS (top/latest/media/people)
   */
  @Get('search')
  @UseGuards(OptionalAuthGuard, RateLimitGuard)
  @RateLimit({ max: 60, windowSecs: 60, keyPrefix: 'search' })
  async search(
    @Query('q') q = '',
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
    @CurrentUser() viewer?: AuthUser,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const result = await this.searchService.search({
      q,
      type,
      viewerId: viewer?.id ?? null,
      limit,
      cursor,
    });
    return result;
  }

  /**
   * GET /api/v1/search/suggest?q=
   *
   * Typeahead: matching users (trigram) + tags (prefix).
   * Used by the composer mention box + search bar.
   */
  @Get('search/suggest')
  @UseGuards(OptionalAuthGuard, RateLimitGuard)
  @RateLimit({ max: 120, windowSecs: 60, keyPrefix: 'search-suggest' })
  async suggest(
    @Query('q') q = '',
    @Query('limit') limitStr?: string,
    @CurrentUser() viewer?: AuthUser,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const result = await this.searchService.suggest({
      q,
      viewerId: viewer?.id ?? null,
      limit,
    });
    return result;
  }
}
