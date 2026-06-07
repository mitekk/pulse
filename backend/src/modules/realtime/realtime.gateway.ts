import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenPayload } from '../auth/auth.service';
import { RealtimePublisherService } from './realtime-publisher.service';
import { MessagingService } from '../messaging/messaging.service';

/** Shape of the WS handshake auth object */
interface WsHandshakeAuth {
  token?: string;
}

/** Augmented socket data stored on the connection */
interface SocketData {
  userId: string;
  handle: string;
  sessionId: string;
}

// Extend Socket to carry typed data
type AuthenticatedSocket = Socket & { data: SocketData };

/**
 * RealtimeGateway — Socket.IO gateway for real-time events.
 *
 * Connection lifecycle:
 *   1. handleConnection: verify access JWT from handshake.auth.token
 *   2. On success: join user:{userId} personal room
 *   3. Client events handled: dm.send, dm.typing, dm.markRead, subscribe.post, unsubscribe.post
 *
 * Rooms:
 *   user:{id}           — joined on connect; personal delivery
 *   conversation:{id}   — joined when DM thread opens; left on close
 *   post:{id}           — joined when thread detail view is active
 */
@WebSocketGateway({
  cors: {
    origin: '*', // Actual CORS enforcement is done by the HTTP adapter; WS inherits from NestJS CORS config
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly realtimePublisher: RealtimePublisherService,
    private readonly messagingService: MessagingService,
  ) {}

  /** Called after the Socket.IO server is created — inject server ref into publisher */
  afterInit(server: Server): void {
    this.realtimePublisher.setServer(server);
    this.logger.log('RealtimeGateway initialized; Socket.IO server registered');
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    const auth = client.handshake.auth as WsHandshakeAuth;
    const token = auth?.token;

    if (!token) {
      this.logger.warn(`WS rejected: no token [socket=${client.id}]`);
      client.emit('error', { code: 'MISSING_TOKEN', message: 'Authentication required.' });
      client.disconnect(true);
      return;
    }

    try {
      const secret =
        this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-in-production';
      const payload = this.jwtService.verify<AccessTokenPayload>(token, { secret });

      // Store user info on socket data
      const sock = client as AuthenticatedSocket;
      sock.data = {
        userId: payload.sub,
        handle: payload.handle,
        sessionId: payload.sessionId,
      };

      // Join personal room
      await client.join(`user:${payload.sub}`);

      this.logger.debug(`WS connected userId=${payload.sub} socketId=${client.id}`);
    } catch (err) {
      this.logger.warn(`WS rejected: invalid token [socket=${client.id}] ${String(err)}`);
      client.emit('error', { code: 'INVALID_TOKEN', message: 'Invalid or expired access token.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const sock = client as AuthenticatedSocket;
    const userId = sock.data?.userId ?? 'unknown';
    this.logger.debug(`WS disconnected userId=${userId} socketId=${client.id}`);
  }

  // ── Helper: get authenticated user or throw ───────────────────────────────

  private requireUser(client: Socket): SocketData {
    const sock = client as AuthenticatedSocket;
    if (!sock.data?.userId) {
      throw new WsException({ code: 'UNAUTHENTICATED', message: 'Not authenticated.' });
    }
    return sock.data;
  }

  // ── Client → Server event handlers ───────────────────────────────────────

  /**
   * dm.send — send a DM message via WebSocket.
   * Routes through the same MessagingService as the REST endpoint
   * to ensure nonce idempotency, permission checks, and persistence.
   */
  @SubscribeMessage('dm.send')
  async handleDmSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      conversationId: string;
      text?: string;
      mediaId?: string;
      clientNonce: string;
    },
  ): Promise<{ message: unknown } | { error: unknown }> {
    try {
      const user = this.requireUser(client);
      const message = await this.messagingService.sendMessage(user.userId, body.conversationId, {
        text: body.text,
        mediaId: body.mediaId,
        clientNonce: body.clientNonce,
      });
      return { message };
    } catch (err) {
      if (err instanceof WsException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      return { error: { code: 'SEND_FAILED', message: msg } };
    }
  }

  /**
   * dm.typing — ephemeral typing indicator.
   * Relays to conversation room without persistence.
   */
  @SubscribeMessage('dm.typing')
  async handleDmTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<void> {
    try {
      const user = this.requireUser(client);

      // Verify the user is a participant before relaying
      const isParticipant = await this.messagingService.isParticipant(
        user.userId,
        body.conversationId,
      );
      if (!isParticipant) return;

      // Broadcast to conversation room (excluding sender)
      client.to(`conversation:${body.conversationId}`).emit('dm.typing', {
        conversationId: body.conversationId,
        userId: user.userId,
      });
    } catch {
      // Typing is ephemeral — swallow errors silently
    }
  }

  /**
   * dm.markRead — mark messages as read via WebSocket.
   * Updates DB and emits dm.read to conversation room.
   */
  @SubscribeMessage('dm.markRead')
  async handleDmMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; lastReadMessageId: string },
  ): Promise<{ ok: boolean } | { error: unknown }> {
    try {
      const user = this.requireUser(client);
      await this.messagingService.markRead(
        user.userId,
        body.conversationId,
        body.lastReadMessageId,
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: { code: 'MARK_READ_FAILED', message: msg } };
    }
  }

  /**
   * subscribe.post — join the post:{id} room for live counter updates.
   */
  @SubscribeMessage('subscribe.post')
  async handleSubscribePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { postId: string },
  ): Promise<void> {
    this.requireUser(client);
    await client.join(`post:${body.postId}`);
    this.logger.debug(`Socket ${client.id} joined post:${body.postId}`);
  }

  /**
   * unsubscribe.post — leave the post:{id} room.
   */
  @SubscribeMessage('unsubscribe.post')
  async handleUnsubscribePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { postId: string },
  ): Promise<void> {
    await client.leave(`post:${body.postId}`);
    this.logger.debug(`Socket ${client.id} left post:${body.postId}`);
  }

  /**
   * join.conversation — join a conversation room (called when DM thread opens).
   * Not in the WS events spec as a named event but needed for room management.
   */
  @SubscribeMessage('join.conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<void> {
    const user = this.requireUser(client);
    const isParticipant = await this.messagingService.isParticipant(
      user.userId,
      body.conversationId,
    );
    if (!isParticipant) {
      throw new WsException({ code: 'FORBIDDEN', message: 'Not a participant.' });
    }
    await client.join(`conversation:${body.conversationId}`);
    this.logger.debug(`Socket ${client.id} joined conversation:${body.conversationId}`);
  }

  /**
   * leave.conversation — leave a conversation room (called when DM thread closes).
   */
  @SubscribeMessage('leave.conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<void> {
    await client.leave(`conversation:${body.conversationId}`);
    this.logger.debug(`Socket ${client.id} left conversation:${body.conversationId}`);
  }
}
