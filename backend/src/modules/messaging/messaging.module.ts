import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Conversation } from './conversation.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { ConversationDyad } from './conversation-dyad.entity';
import { Message } from './message.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { REALTIME_PUBLISHER_PORT } from '../timeline/realtime-publisher.port';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { User } from '../users/user.entity';
import { Follow } from '../users/follow.entity';
import { Block } from '../users/block.entity';

/**
 * MessagingModule — DM conversations, messages, read receipts, mute.
 *
 * DM_NOTIFICATION_PORT defaults to NoopDmNotificationService.
 * Subtask 8b (NotificationsModule) replaces this with a real implementation
 * that writes notification rows and emits WS events.
 *
 * The real RealtimePublisherService is injected here after RealtimeModule
 * provides it. MessagingController uses it to publish dm.message after save.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      ConversationDyad,
      Message,
      User,
      Follow,
      Block,
    ]),
    AuthModule,
    UsersModule,
  ],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    // DM_NOTIFICATION_PORT resolves from the @Global NotificationsModule
    // (RealDmNotificationService) — no local binding needed.
    // Wire REALTIME_PUBLISHER_PORT to the live singleton via useExisting.
    // RealtimeModule is @Global so RealtimePublisherService is resolvable here
    // without importing RealtimeModule (avoids a cycle). DM messages and read
    // receipts are now pushed live over WebSockets.
    { provide: REALTIME_PUBLISHER_PORT, useExisting: RealtimePublisherService },
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
