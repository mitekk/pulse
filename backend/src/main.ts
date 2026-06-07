import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false, // NestJS Logger handles logging via LoggingInterceptor
      trustProxy: true, // needed for correct IP resolution behind proxies
    }),
  );

  const config = app.get(ConfigService);
  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  const port = config.get<number>('PORT') ?? 3000;
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

  // Wire Socket.IO Redis adapter for cross-instance fan-out
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redisUrl);
  app.useWebSocketAdapter(redisIoAdapter);

  // Cookie support — required for httpOnly refresh token + CSRF cookie
  await app.register(fastifyCookie);

  // Security headers via @fastify/helmet
  await app.register(helmet, {
    contentSecurityPolicy: nodeEnv === 'production',
    crossOriginEmbedderPolicy: nodeEnv === 'production',
  });

  // CORS — explicit allow-list; never wildcard in production; X-CSRF-Token required for refresh
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
  });

  // Global validation pipe — whitelist + forbid unknown properties + transform
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // All routes under /api/v1 (health stays at /health for Docker health checks)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  await app.listen(port, '0.0.0.0');

  const logger = app.getHttpServer();
  // Using process.stdout to avoid ESLint no-console on bootstrap
  process.stdout.write(`[Bootstrap] App listening on port ${port} (${nodeEnv})\n`);
  process.stdout.write(`[Bootstrap] Web origin: ${webOrigin}\n`);

  void logger;
}

bootstrap().catch((err) => {
  process.stderr.write(`[Bootstrap] Fatal error: ${String(err)}\n`);
  process.exit(1);
});
