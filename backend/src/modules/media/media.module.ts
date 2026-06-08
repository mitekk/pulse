import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Media } from './media.entity';
import { PostMedia } from './post-media.entity';
import { StorageUsage } from './storage-usage.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaProcessProcessor } from './media-process.processor';
import { MediaAttachAdapter } from './media-attach.adapter';
import { MediaLimits } from './media-limits';
import { QuotaService } from './quota.service';
import { MediaReaperService } from './media-reaper.service';
import { MediaHydrationService } from './media-hydration.service';
import { MEDIA_ATTACH_PORT } from '../posts/media-attach.port';
import { StorageModule } from '../../infra/storage/storage.module';
import { AuthModule } from '../auth/auth.module';

/**
 * MediaModule — presigned upload, finalize, media.process worker, metadata endpoints.
 *
 * @Global() so that MediaAttachAdapter (MEDIA_ATTACH_PORT) is available to
 * PostsModule without explicit re-imports, mirroring the pattern in EngagementModule.
 *
 * Queues:
 *   - 'media' queue: registered here with MediaProcessProcessor.
 *     media.process jobs enqueued by MediaService.finalize().
 *
 * Exports:
 *   - MediaService — consumed by PostsModule for media-attach via adapter
 *   - TypeOrmModule — exports Media + PostMedia entities for other modules
 *   - MEDIA_ATTACH_PORT — override the noop in PostsModule global scope
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Media, PostMedia, StorageUsage]),
    BullModule.registerQueue({ name: 'media' }),
    StorageModule,
    AuthModule,
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaProcessProcessor,
    MediaAttachAdapter,
    MediaLimits,
    QuotaService,
    MediaReaperService,
    MediaHydrationService,
    {
      provide: MEDIA_ATTACH_PORT,
      useClass: MediaAttachAdapter,
    },
  ],
  exports: [MediaService, QuotaService, MediaHydrationService, TypeOrmModule, MEDIA_ATTACH_PORT],
})
export class MediaModule {}
