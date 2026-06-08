import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

/**
 * RealtimeModule — Socket.IO gateway + Redis pub/sub publisher.
 *
 * @Global — makes RealtimePublisherService resolvable by any module in the
 * application without importing RealtimeModule directly. This ensures consumer
 * modules (TimelineModule, NotificationsModule, MessagingModule) all receive
 * the SAME singleton instance via `useExisting: RealtimePublisherService`, so
 * RealtimeGateway.afterInit()'s setServer() call is visible to every emitter.
 *
 * Provides:
 *   - RealtimeGateway: WS gateway (connect/disconnect + event handlers)
 *   - RealtimePublisherService: implements RealtimePublisherPort + pub/sub subscriber
 *
 * The Redis adapter is wired in main.ts via RedisIoAdapter.
 */
@Global()
@Module({
  imports: [
    AuthModule, // Provides JwtService + AuthService for WS handshake auth
    MessagingModule, // Provides MessagingService for dm.send/dm.markRead handlers
  ],
  providers: [RealtimeGateway, RealtimePublisherService],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}
