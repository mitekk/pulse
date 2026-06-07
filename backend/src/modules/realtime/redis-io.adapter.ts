import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * RedisIoAdapter — wraps the standard NestJS IoAdapter to plug in
 * the @socket.io/redis-adapter for cross-instance fan-out.
 *
 * Uses ioredis clients (same library as the rest of the backend).
 * The pub client is a dedicated connection; the sub client is a duplicate
 * (dedicated subscribe-only connection, matching ioredis best practice).
 *
 * Usage in main.ts:
 *   const redisAdapter = new RedisIoAdapter(app);
 *   await redisAdapter.connectToRedis(redisUrl);
 *   app.useWebSocketAdapter(redisAdapter);
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    const pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    const subClient = pubClient.duplicate();

    // Wait for both connections to be ready
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        pubClient.once('ready', resolve);
        pubClient.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        subClient.once('ready', resolve);
        subClient.once('error', reject);
      }),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, options) as ReturnType<
      IoAdapter['createIOServer']
    > & { adapter: (a: unknown) => void };
    server.adapter(this.adapterConstructor);
    return server;
  }
}
