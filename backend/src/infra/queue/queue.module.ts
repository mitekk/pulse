import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * QueueModule — registers BullMQ with the shared Redis connection.
 *
 * Named queues (fanout, media, notifications, etc.) are registered individually
 * in the domain modules that own them. This module only sets up the global
 * connection config.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          // BullMQ requires this to be null — its blocking worker commands must
          // not give up after N retries, or the queue silently stalls.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
