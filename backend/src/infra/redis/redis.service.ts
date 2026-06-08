import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService — manages two ioredis connections:
 *   1. `client`     — general-purpose commands (GET, SET, ZADD, HSET, etc.)
 *   2. `subscriber` — dedicated connection for Redis pub/sub (SUBSCRIBE / PSUBSCRIBE)
 *
 * A single connection cannot serve both regular commands AND subscriptions;
 * the subscriber connection must be a separate duplicate.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private _client!: Redis;
  private _subscriber!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    this._client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this._subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // unlimited — subscriber must stay connected
      // enableReadyCheck MUST be false on the subscriber connection.
      // With it enabled, ioredis gates "ready" behind an INFO command.
      // RealtimePublisherService.onModuleInit() calls subscriber.subscribe()
      // before that INFO round-trip completes; the INFO then fails with
      // "Connection in subscriber mode, only subscriber commands may be used",
      // ioredis reconnects, and — critically — the early SUBSCRIBE is NOT
      // tracked for auto-resubscribe. Result: PUBSUB NUMSUB → 0, every
      // client.publish() reaches no one, and all live push events are silently
      // dropped. Setting false makes the connection ready immediately on
      // connect, so the SUBSCRIBE is registered and survives reconnects.
      enableReadyCheck: false,
      lazyConnect: false,
    });

    this._client.on('connect', () => this.logger.log('Redis client connected'));
    this._client.on('error', (err) => this.logger.error('Redis client error', err));

    this._subscriber.on('connect', () => this.logger.log('Redis subscriber connected'));
    this._subscriber.on('error', (err) => this.logger.error('Redis subscriber error', err));
  }

  async onModuleDestroy(): Promise<void> {
    await this._client.quit();
    await this._subscriber.quit();
  }

  /** General-purpose Redis connection */
  get client(): Redis {
    return this._client;
  }

  /** Dedicated pub/sub connection (SUBSCRIBE, PSUBSCRIBE) */
  get subscriber(): Redis {
    return this._subscriber;
  }

  /**
   * Health check — pings the main Redis client.
   * Returns 'ok' on success, 'error' with message on failure.
   */
  async ping(): Promise<'ok' | 'error'> {
    try {
      const result = await this._client.ping();
      return result === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }
}
