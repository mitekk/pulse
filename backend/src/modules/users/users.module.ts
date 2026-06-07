import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Block } from './block.entity';
import { Follow } from './follow.entity';
import { Mute } from './mute.entity';
import { NoopNotificationService } from './noop-notification.service';
import { NOTIFICATION_PORT } from './notification.port';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { VisibilityService } from './visibility.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Follow, Block, Mute]),
    // Import AuthModule to get AuthGuard, OptionalAuthGuard, and JwtModule
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    VisibilityService,
    {
      provide: NOTIFICATION_PORT,
      useClass: NoopNotificationService,
    },
  ],
  exports: [
    UsersService,
    VisibilityService,
    // Export entities so peer modules can use them without re-registering
    TypeOrmModule,
  ],
})
export class UsersModule {}
