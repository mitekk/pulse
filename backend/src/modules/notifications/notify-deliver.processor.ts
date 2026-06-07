import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import {
  REALTIME_PUBLISHER_PORT,
  RealtimePublisherPort,
} from '../timeline/realtime-publisher.port';
import { NotificationDto } from './dto/notification.dto';
import { UserCardDto } from '../users/dto/user-card.dto';

export interface NotifyDeliverJobData {
  notificationId: string;
  recipientId: string;
}

/**
 * NotifyDeliverProcessor — BullMQ worker for the 'notify' queue, 'notify.deliver' job.
 *
 * On each job:
 *   1. Load the notification row (with actor relation).
 *   2. Build a minimal NotificationDto (single-actor, no aggregation at push time —
 *      the client re-fetches the aggregated list on foreground; the push is just
 *      a badge increment trigger).
 *   3. Emit WS 'notification.new' to user:{recipientId} via publishNotification().
 *
 * The Redis unread badge is incremented by NotificationsService.createNotification()
 * synchronously before the job is enqueued — no additional increment here.
 */
@Processor('notify')
export class NotifyDeliverProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyDeliverProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @Inject(REALTIME_PUBLISHER_PORT)
    private readonly realtimePublisher: RealtimePublisherPort,
  ) {
    super();
  }

  async process(job: Job<NotifyDeliverJobData>): Promise<void> {
    const { notificationId, recipientId } = job.data;

    // Load notification with actor relation
    const notif = await this.notifRepo.findOne({
      where: { id: notificationId },
      relations: ['actor'],
    });

    if (!notif) {
      this.logger.warn(`notify.deliver: notification ${notificationId} not found — skipping`);
      return;
    }

    if (!notif.actor) {
      this.logger.warn(`notify.deliver: actor not loaded for notification ${notificationId}`);
      return;
    }

    // Build a minimal NotificationDto for the WS push
    const actor: UserCardDto = {
      id: notif.actor.id,
      handle: notif.actor.handle,
      displayName: notif.actor.displayName,
      avatarUrl: null,
      isVerified: notif.actor.isVerified,
      isPrivate: notif.actor.isPrivate,
    };

    const dto: NotificationDto = {
      id: notif.id,
      type: notif.type,
      actors: [actor],
      otherCount: 0,
      post: null, // shallow post omitted from push; client re-fetches full aggregated list
      readAt: notif.readAt?.toISOString() ?? null,
      createdAt: notif.createdAt.toISOString(),
    };

    // Emit via Redis pub/sub → all instances → user:{recipientId} room
    await this.realtimePublisher.publishNotification(recipientId, dto);

    this.logger.debug(
      `notify.deliver: emitted notification.new type=${notif.type} recipient=${recipientId}`,
    );
  }
}
