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
import { NoopDmNotificationService } from './noop-dm-notification.service';
import { DM_NOTIFICATION_PORT } from './dm-notification.port';
import { REALTIME_PUBLISHER_PORT } from '../timeline/realtime-publisher.port';
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
    {
      provide: DM_NOTIFICATION_PORT,
      useClass: NoopDmNotificationService,
    },
    // Noop default for REALTIME_PUBLISHER_PORT — AppModule overrides with the real
    // RealtimePublisherService once RealtimeModule is loaded.
    {
      provide: REALTIME_PUBLISHER_PORT,
      useValue: {
        notifyNewTimelinePosts: async () => undefined,
        publishNotification: async () => undefined,
        publishDmMessage: async () => undefined,
        publishDmRead: async () => undefined,
      },
    },
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
