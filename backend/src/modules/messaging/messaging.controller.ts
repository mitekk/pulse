import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AccessTokenPayload } from '../auth/auth.service';
import { MessagingService } from './messaging.service';
import {
  REALTIME_PUBLISHER_PORT,
  RealtimePublisherPort,
} from '../timeline/realtime-publisher.port';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { UsersService } from '../users/users.service';

/**
 * Extended publisher interface used by messaging.
 * The real RealtimePublisherService implements these additional methods;
 * the noop only has notifyNewTimelinePosts.
 */
interface RealtimePublisher extends RealtimePublisherPort {
  publishDmMessage?(
    conversationId: string,
    recipientIds: string[],
    message: unknown,
  ): Promise<void>;
  publishDmRead?(conversationId: string, userId: string, lastReadMessageId: string): Promise<void>;
}

@Controller('conversations')
@UseGuards(AuthGuard)
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    @Inject(REALTIME_PUBLISHER_PORT)
    private readonly realtimePublisher: RealtimePublisher,
    @Inject(UsersService)
    private readonly usersService: UsersService,
  ) {}

  /**
   * GET /api/v1/conversations
   * List conversations for the current user (cursor-paginated).
   */
  @Get()
  async listConversations(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ): Promise<{ items: unknown[]; cursor: string | null; hasMore: boolean }> {
    return this.messagingService.listConversations(user.id, limit ?? 20, cursor);
  }

  /**
   * POST /api/v1/conversations
   * Create or return a canonical 1:1 conversation with the given recipient handle.
   * Idempotent: returns existing conversation if it already exists.
   */
  @Post()
  @HttpCode(201)
  async createConversation(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Body() body: CreateConversationDto,
  ): Promise<{ conversation: unknown }> {
    // Resolve handle to user ID
    const recipient = await this.usersService.findByHandle(body.recipientHandle);
    if (!recipient) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: `User @${body.recipientHandle} not found.` },
      });
    }

    const conversation = await this.messagingService.getOrCreateDm(user.id, recipient.id);
    return { conversation };
  }

  /**
   * GET /api/v1/conversations/:id/messages
   * Get messages in a conversation (participant-only access).
   */
  @Get(':id/messages')
  async getMessages(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ): Promise<{ items: unknown[]; cursor: string | null; hasMore: boolean }> {
    return this.messagingService.getMessages(user.id, conversationId, limit ?? 20, cursor);
  }

  /**
   * POST /api/v1/conversations/:id/messages
   * Send a message to a conversation (nonce-idempotent).
   * Rate limited: 500/day.
   */
  @Post(':id/messages')
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 500, windowSecs: 86400, keyPrefix: 'dm' })
  async sendMessage(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Param('id') conversationId: string,
    @Body() body: SendMessageDto,
  ): Promise<{ message: unknown }> {
    const message = await this.messagingService.sendMessage(user.id, conversationId, {
      text: body.text,
      mediaId: body.mediaId,
      clientNonce: body.clientNonce,
    });

    // Publish to Redis pub/sub for cross-instance fan-out (real publisher has this method)
    if (this.realtimePublisher.publishDmMessage) {
      await this.realtimePublisher.publishDmMessage(conversationId, [], message);
    }

    return { message };
  }

  /**
   * POST /api/v1/conversations/:id/read
   * Mark messages as read.
   */
  @Post(':id/read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Param('id') conversationId: string,
    @Body() body: MarkReadDto,
  ): Promise<{ ok: boolean }> {
    await this.messagingService.markRead(user.id, conversationId, body.lastReadMessageId);

    // Publish dm.read to conversation room (real publisher has this method)
    if (this.realtimePublisher.publishDmRead) {
      await this.realtimePublisher.publishDmRead(conversationId, user.id, body.lastReadMessageId);
    }

    return { ok: true };
  }

  /**
   * POST /api/v1/conversations/:id/mute
   * Mute a conversation.
   */
  @Post(':id/mute')
  @HttpCode(200)
  async muteConversation(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Param('id') conversationId: string,
  ): Promise<{ muted: boolean }> {
    await this.messagingService.muteConversation(user.id, conversationId);
    return { muted: true };
  }

  /**
   * DELETE /api/v1/conversations/:id/mute
   * Unmute a conversation.
   */
  @Delete(':id/mute')
  @HttpCode(200)
  async unmuteConversation(
    @CurrentUser() user: AccessTokenPayload & { id: string },
    @Param('id') conversationId: string,
  ): Promise<{ muted: boolean }> {
    await this.messagingService.unmuteConversation(user.id, conversationId);
    return { muted: false };
  }
}
