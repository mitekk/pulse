import { Injectable, Logger } from '@nestjs/common';
import { TrendsIncrementPort } from './trends-increment.port';

/**
 * NoopTrendsIncrementService — no-op default for TrendsIncrementPort.
 *
 * Active when HashtagsModule is not wired (unit tests, early dev).
 * AppModule replaces this with TrendsService from HashtagsModule.
 */
@Injectable()
export class NoopTrendsIncrementService implements TrendsIncrementPort {
  private readonly logger = new Logger(NoopTrendsIncrementService.name);

  async incrementTags(tags: string[]): Promise<void> {
    this.logger.debug(`[noop] incrementTags tags=${tags.join(',')} — no trends service wired`);
  }
}
