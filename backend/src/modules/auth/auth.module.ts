import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConsoleMailer } from './console-mailer.service';
import { EmailVerificationToken } from './email-verification-token.entity';
import { MAILER_PORT } from './mailer.port';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { SessionCleanupProcessor } from './session-cleanup.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, EmailVerificationToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const expiry = (config.get<string>('JWT_ACCESS_EXPIRY') ??
          '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`;
        return {
          secret: config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-in-production',
          signOptions: { expiresIn: expiry },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'sessions' }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    SessionCleanupProcessor,
    {
      provide: MAILER_PORT,
      useClass: ConsoleMailer,
    },
  ],
  exports: [AuthService, AuthGuard, OptionalAuthGuard, JwtModule],
})
export class AuthModule implements OnModuleInit {
  constructor(
    @InjectQueue('sessions')
    private readonly sessionsQueue: Queue,
  ) {}

  /**
   * Register the `session.cleanup` repeatable cron job.
   * Runs every 6 hours. Idempotent — BullMQ deduplicates by jobId.
   */
  async onModuleInit(): Promise<void> {
    await this.sessionsQueue.add(
      'session.cleanup',
      { jobType: 'cleanup' },
      {
        repeat: {
          pattern: '0 */6 * * *', // every 6 hours
        },
        jobId: 'session.cleanup.cron',
      },
    );
  }
}
