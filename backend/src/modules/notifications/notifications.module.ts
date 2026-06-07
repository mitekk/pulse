import { Module } from '@nestjs/common';
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
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';

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
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: 'notify' }),
    AuthModule,
    UsersModule, // User entity; block/mute checks use raw queries on DataSource
    PostsModule, // Post entity for loading post data in aggregation
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotifyDeliverProcessor,
    RealNotificationService,
    RealPostsNotificationService,
    RealDmNotificationService,
  ],
  exports: [
    NotificationsService,
    RealNotificationService,
    RealPostsNotificationService,
    RealDmNotificationService,
  ],
})
export class NotificationsModule {}
