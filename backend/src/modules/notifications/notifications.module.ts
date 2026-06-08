import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotifyDeliverProcessor } from './notify-deliver.processor';
import { RealNotificationService } from './real-notification.service';
import { RealPostsNotificationService } from './real-posts-notification.service';
import { RealDmNotificationService } from './real-dm-notification.service';
import { AuthModule } from '../auth/auth.module';
import { Post } from '../posts/post.entity';
import { POSTS_NOTIFICATION_PORT } from '../posts/posts-notification.port';
import { NOTIFICATION_PORT } from '../users/notification.port';
import { DM_NOTIFICATION_PORT } from '../messaging/dm-notification.port';
import { REALTIME_PUBLISHER_PORT } from '../timeline/realtime-publisher.port';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';

/**
 * NotificationsModule — notification creation, delivery, and aggregation.
 *
 * Provides:
 *   - NotificationsService: core create/read/mark-read logic
 *   - NotifyDeliverProcessor: BullMQ worker for 'notify.deliver' jobs
 *   - RealNotificationService: real impl of NOTIFICATION_PORT (UsersModule seam)
 *   - RealPostsNotificationService: real impl of POSTS_NOTIFICATION_PORT (PostsModule seam)
 *   - RealDmNotificationService: real impl of DM_NOTIFICATION_PORT (MessagingModule seam)
 *
 * Exports:
 *   - NotificationsService — for AppModule to wire token overrides
 *   - RealNotificationService, RealPostsNotificationService, RealDmNotificationService
 *     — for AppModule to provide them at NOTIFICATION_PORT / POSTS_NOTIFICATION_PORT / DM_NOTIFICATION_PORT
 *
 * Queue:
 *   - 'notify' queue registered here with NotifyDeliverProcessor as consumer.
 */
@Global()
@Module({
  imports: [
    // Only the Post entity repo is needed (for aggregation) — importing PostsModule
    // / UsersModule would create a notifications<->posts/users cycle, since those
    // modules consume the notification ports this @Global module provides below.
    TypeOrmModule.forFeature([Notification, Post]),
    BullModule.registerQueue({ name: 'notify' }),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotifyDeliverProcessor,
    RealNotificationService,
    RealPostsNotificationService,
    RealDmNotificationService,
    // Bind the notification seam ports to their real implementations. Because this
    // module is @Global, consuming modules (posts, engagement, users, messaging)
    // resolve these tokens from here once they drop their local noop bindings.
    { provide: POSTS_NOTIFICATION_PORT, useExisting: RealPostsNotificationService },
    { provide: NOTIFICATION_PORT, useExisting: RealNotificationService },
    { provide: DM_NOTIFICATION_PORT, useExisting: RealDmNotificationService },
    // Wire REALTIME_PUBLISHER_PORT to the live singleton via useExisting.
    // RealtimeModule is @Global so RealtimePublisherService is resolvable here
    // without importing RealtimeModule (avoids a cycle). All published
    // notifications are now pushed live over WebSockets.
    { provide: REALTIME_PUBLISHER_PORT, useExisting: RealtimePublisherService },
  ],
  exports: [
    NotificationsService,
    RealNotificationService,
    RealPostsNotificationService,
    RealDmNotificationService,
    POSTS_NOTIFICATION_PORT,
    NOTIFICATION_PORT,
    DM_NOTIFICATION_PORT,
  ],
})
export class NotificationsModule {}
