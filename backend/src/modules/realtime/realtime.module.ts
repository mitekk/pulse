import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisherService } from './realtime-publisher.service';

/**
 * RealtimeModule — Socket.IO gateway + Redis pub/sub publisher.
 *
 * Provides:
 *   - RealtimeGateway: WS gateway (connect/disconnect + event handlers)
 *   - RealtimePublisherService: implements RealtimePublisherPort + pub/sub subscriber
 *
 * RealtimePublisherService is exported globally so AppModule can override
 * REALTIME_PUBLISHER_PORT token with the real implementation.
 *
 * The Redis adapter is wired in main.ts via RedisIoAdapter.
 */
@Module({
  imports: [
    AuthModule, // Provides JwtService + AuthService for WS handshake auth
    MessagingModule, // Provides MessagingService for dm.send/dm.markRead handlers
  ],
  providers: [RealtimeGateway, RealtimePublisherService],
  exports: [RealtimePublisherService],
})
export class RealtimeModule {}
