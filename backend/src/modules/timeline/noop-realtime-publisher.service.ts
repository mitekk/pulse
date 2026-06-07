import { Injectable, Logger } from '@nestjs/common';
import { RealtimePublisherPort } from './realtime-publisher.port';

/**
 * NoopRealtimePublisherService — default no-op implementation of RealtimePublisherPort.
 *
 * Subtask 8 (RealtimeModule) replaces this with the real Socket.IO emission
 * by overriding the REALTIME_PUBLISHER_PORT token in AppModule. The interface
 * is stable — subtask 8 implements it without touching TimelineService.
 */
@Injectable()
export class NoopRealtimePublisherService implements RealtimePublisherPort {
  private readonly logger = new Logger(NoopRealtimePublisherService.name);

  async notifyNewTimelinePosts(userId: string, count: number, previewIds: string[]): Promise<void> {
    this.logger.debug(
      `[noop] timeline.newPosts userId=${userId} count=${count} previewIds=${previewIds.join(',')}`,
    );
  }
}
