import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CursorUtil } from '../../common/utils/cursor.util';
import { Block } from './block.entity';
import { Follow } from './follow.entity';
import { Mute } from './mute.entity';
import { User } from './user.entity';
import { VisibilityService } from './visibility.service';
import { CursorPageDto } from './dto/cursor-page.dto';
import { FollowRequestDto } from './dto/follow-request.dto';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserCardDto } from './dto/user-card.dto';
import { NOTIFICATION_PORT, NotificationPort } from './notification.port';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    @InjectRepository(Mute)
    private readonly muteRepo: Repository<Mute>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly visibilityService: VisibilityService,
    @Inject(NOTIFICATION_PORT)
    private readonly notificationPort: NotificationPort,
  ) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  async getProfile(handle: string, viewerId: string | null): Promise<{ user: ProfileDto }> {
    const user = await this.userRepo.findOne({
      where: { handle: handle as unknown as string },
      withDeleted: false,
    });
    if (!user)
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });

    const visibility = await this.visibilityService.canViewProfile(viewerId, user);
    if (!visibility.visible) {
      if (visibility.reason === 'blocked') {
        throw new ForbiddenException({
          error: { code: 'BLOCKED', message: 'Cannot view this profile.' },
        });
      }
      // Private account — return minimal stub indicating it's private
      // (spec §3.6 returns profile with private flag set, no posts/bio visible)
      const stub = ProfileDto.fromEntity(user, {
        following: false,
        followedBy: false,
        blocked: false,
        muted: false,
        followRequested: false,
      });
      // Null out fields not visible to non-followers on private accounts
      stub.bio = null;
      stub.location = null;
      stub.website = null;
      return { user: stub };
    }

    const viewer = await this.loadViewerRelationship(viewerId, user.id);
    return { user: ProfileDto.fromEntity(user, viewer) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<{ user: ProfileDto }> {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.bio !== undefined) user.bio = dto.bio;
    if (dto.location !== undefined) user.location = dto.location;
    if (dto.website !== undefined) user.website = dto.website ?? null;
    if (dto.avatarMediaId !== undefined) user.avatarMediaId = dto.avatarMediaId;
    if (dto.bannerMediaId !== undefined) user.bannerMediaId = dto.bannerMediaId;
    if (dto.isPrivate !== undefined) user.isPrivate = dto.isPrivate;
    if (dto.dmPrivacy !== undefined) user.dmPrivacy = dto.dmPrivacy;

    const saved = await this.userRepo.save(user);
    const viewer = await this.loadViewerRelationship(userId, saved.id);
    return { user: ProfileDto.fromEntity(saved, viewer) };
  }

  // ─── Followers / Following lists ───────────────────────────────────────────

  async getFollowers(
    handle: string,
    viewerId: string | null,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPageDto<UserCardDto>> {
    const user = await this.requireUser(handle);
    await this.assertProfileVisible(viewerId, user);
    return this.paginateUserList('follower', user.id, viewerId, cursor, limit);
  }

  async getFollowing(
    handle: string,
    viewerId: string | null,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPageDto<UserCardDto>> {
    const user = await this.requireUser(handle);
    await this.assertProfileVisible(viewerId, user);
    return this.paginateUserList('following', user.id, viewerId, cursor, limit);
  }

  // ─── Follow / Unfollow ─────────────────────────────────────────────────────

  async follow(followerId: string, targetHandle: string): Promise<{ state: 'active' | 'pending' }> {
    const target = await this.requireUser(targetHandle);

    if (followerId === target.id) {
      throw new BadRequestException({
        error: { code: 'CANNOT_FOLLOW_SELF', message: 'Cannot follow yourself.' },
      });
    }

    // Check for block in either direction
    const blocked = await this.visibilityService.isBlocked(followerId, target.id);
    if (blocked) {
      throw new ForbiddenException({
        error: { code: 'BLOCKED', message: 'Cannot follow this user.' },
      });
    }

    // Check if already following
    const existing = await this.followRepo.findOne({
      where: { followerId, followeeId: target.id },
    });
    if (existing) {
      return { state: existing.state };
    }

    const state: 'active' | 'pending' = target.isPrivate ? 'pending' : 'active';

    await this.dataSource.transaction(async (em) => {
      await em.insert(Follow, {
        followerId,
        followeeId: target.id,
        state,
      });

      if (state === 'active') {
        // Increment counters transactionally — no read-modify-write
        await em.query(`UPDATE users SET followers_count = followers_count + 1 WHERE id = $1`, [
          target.id,
        ]);
        await em.query(`UPDATE users SET following_count = following_count + 1 WHERE id = $1`, [
          followerId,
        ]);
      }
    });

    // Emit notification outside the transaction (best-effort)
    if (state === 'active') {
      await this.notificationPort.notifyFollow(followerId, target.id).catch((err) => {
        this.logger.warn(`Failed to emit follow notification: ${String(err)}`);
      });
    } else {
      await this.notificationPort.notifyFollowRequest(followerId, target.id).catch((err) => {
        this.logger.warn(`Failed to emit follow_request notification: ${String(err)}`);
      });
    }

    return { state };
  }

  async unfollow(followerId: string, targetHandle: string): Promise<void> {
    const target = await this.requireUser(targetHandle);

    const existing = await this.followRepo.findOne({
      where: { followerId, followeeId: target.id },
    });
    if (!existing) return; // already not following — idempotent

    await this.dataSource.transaction(async (em) => {
      await em.delete(Follow, { followerId, followeeId: target.id });

      if (existing.state === 'active') {
        await em.query(
          `UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1`,
          [target.id],
        );
        await em.query(
          `UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1`,
          [followerId],
        );
      }
      // If state was 'pending', no counters were incremented, so no decrement needed
    });
  }

  // ─── Block / Unblock ───────────────────────────────────────────────────────

  async block(blockerId: string, targetHandle: string): Promise<{ blocked: true }> {
    const target = await this.requireUser(targetHandle);

    if (blockerId === target.id) {
      throw new BadRequestException({
        error: { code: 'CANNOT_BLOCK_SELF', message: 'Cannot block yourself.' },
      });
    }

    const existing = await this.blockRepo.findOne({
      where: { blockerId, blockedId: target.id },
    });
    if (existing) return { blocked: true }; // idempotent

    await this.dataSource.transaction(async (em) => {
      // Remove follow in both directions, adjusting counters
      const blockerFollowsTarget = await em.findOne(Follow, {
        where: { followerId: blockerId, followeeId: target.id },
      });
      const targetFollowsBlocker = await em.findOne(Follow, {
        where: { followerId: target.id, followeeId: blockerId },
      });

      if (blockerFollowsTarget) {
        await em.delete(Follow, { followerId: blockerId, followeeId: target.id });
        if (blockerFollowsTarget.state === 'active') {
          await em.query(
            `UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1`,
            [target.id],
          );
          await em.query(
            `UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1`,
            [blockerId],
          );
        }
      }

      if (targetFollowsBlocker) {
        await em.delete(Follow, { followerId: target.id, followeeId: blockerId });
        if (targetFollowsBlocker.state === 'active') {
          await em.query(
            `UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1`,
            [blockerId],
          );
          await em.query(
            `UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1`,
            [target.id],
          );
        }
      }

      // Insert block row
      await em.insert(Block, { blockerId, blockedId: target.id });

      // TODO Phase 5: purge blocked user's posts from blocker's home timeline Redis zset
      // await this.timelineZsetPurge(blockerId, target.id);
    });

    return { blocked: true };
  }

  async unblock(blockerId: string, targetHandle: string): Promise<void> {
    const target = await this.requireUser(targetHandle);
    await this.blockRepo.delete({ blockerId, blockedId: target.id });
  }

  // ─── Mute / Unmute ────────────────────────────────────────────────────────

  async mute(muterId: string, targetHandle: string): Promise<{ muted: true }> {
    const target = await this.requireUser(targetHandle);

    if (muterId === target.id) {
      throw new BadRequestException({
        error: { code: 'CANNOT_MUTE_SELF', message: 'Cannot mute yourself.' },
      });
    }

    const existing = await this.muteRepo.findOne({
      where: { muterId, mutedId: target.id },
    });
    if (existing) return { muted: true }; // idempotent

    await this.muteRepo.insert({ muterId, mutedId: target.id });
    return { muted: true };
  }

  async unmute(muterId: string, targetHandle: string): Promise<void> {
    const target = await this.requireUser(targetHandle);
    await this.muteRepo.delete({ muterId, mutedId: target.id });
  }

  // ─── Follow Requests (private accounts) ───────────────────────────────────

  async getFollowRequests(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPageDto<FollowRequestDto>> {
    const safeLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

    let qb = this.followRepo
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.follower', 'requester')
      .where('f.followee_id = :userId AND f.state = :state', { userId, state: 'pending' })
      .orderBy('f.created_at', 'DESC')
      .limit(safeLimit + 1);

    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      if (decoded.type !== 'id') throw new BadRequestException('Invalid cursor');
      qb = qb.andWhere(
        'f.created_at < (SELECT created_at FROM follows WHERE follower_id = :cid AND followee_id = :uid)',
        {
          cid: decoded.id,
          uid: userId,
        },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    const page = rows.slice(0, safeLimit);

    const items = page
      .filter((f) => f.follower != null)
      .map((f) => FollowRequestDto.fromFollow(f, f.follower as NonNullable<typeof f.follower>));
    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].followerId) : null;

    return CursorPageDto.of(items, nextCursor, hasMore);
  }

  async acceptFollowRequest(
    userId: string, // the followee accepting
    requestId: string,
  ): Promise<{ state: 'active' }> {
    const { followerId, followeeId } = this.parseRequestId(requestId);

    if (followeeId !== userId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Not your follow request.' },
      });
    }

    const follow = await this.followRepo.findOne({
      where: { followerId, followeeId, state: 'pending' },
    });
    if (!follow) {
      throw new NotFoundException({
        error: { code: 'FOLLOW_REQUEST_NOT_FOUND', message: 'Follow request not found.' },
      });
    }

    await this.dataSource.transaction(async (em) => {
      await em.update(Follow, { followerId, followeeId }, { state: 'active' });
      await em.query(`UPDATE users SET followers_count = followers_count + 1 WHERE id = $1`, [
        followeeId,
      ]);
      await em.query(`UPDATE users SET following_count = following_count + 1 WHERE id = $1`, [
        followerId,
      ]);
    });

    await this.notificationPort.notifyFollowAccepted(followerId, followeeId).catch((err) => {
      this.logger.warn(`Failed to emit follow_accepted notification: ${String(err)}`);
    });

    return { state: 'active' };
  }

  async declineFollowRequest(userId: string, requestId: string): Promise<{ state: 'declined' }> {
    const { followerId, followeeId } = this.parseRequestId(requestId);

    if (followeeId !== userId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Not your follow request.' },
      });
    }

    const follow = await this.followRepo.findOne({
      where: { followerId, followeeId, state: 'pending' },
    });
    if (!follow) {
      throw new NotFoundException({
        error: { code: 'FOLLOW_REQUEST_NOT_FOUND', message: 'Follow request not found.' },
      });
    }

    await this.followRepo.delete({ followerId, followeeId });
    return { state: 'declined' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  async requireUser(handle: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { handle: handle as unknown as string } });
    if (!user)
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    return user;
  }

  private async assertProfileVisible(viewerId: string | null, user: User): Promise<void> {
    const vis = await this.visibilityService.canViewProfile(viewerId, user);
    if (!vis.visible) {
      if (vis.reason === 'blocked') {
        throw new ForbiddenException({
          error: { code: 'BLOCKED', message: 'Cannot view this profile.' },
        });
      }
      throw new ForbiddenException({
        error: { code: 'PRIVATE_ACCOUNT', message: 'This account is private.' },
      });
    }
  }

  private async loadViewerRelationship(
    viewerId: string | null,
    targetId: string,
  ): Promise<{
    following: boolean;
    followedBy: boolean;
    blocked: boolean;
    muted: boolean;
    followRequested: boolean;
  }> {
    if (viewerId === null) {
      return {
        following: false,
        followedBy: false,
        blocked: false,
        muted: false,
        followRequested: false,
      };
    }
    if (viewerId === targetId) {
      return {
        following: false,
        followedBy: false,
        blocked: false,
        muted: false,
        followRequested: false,
      };
    }

    const [followOut, followIn, block, mute] = await Promise.all([
      this.followRepo.findOne({ where: { followerId: viewerId, followeeId: targetId } }),
      this.followRepo.findOne({
        where: { followerId: targetId, followeeId: viewerId, state: 'active' },
      }),
      this.blockRepo.findOne({ where: { blockerId: viewerId, blockedId: targetId } }),
      this.muteRepo.findOne({ where: { muterId: viewerId, mutedId: targetId } }),
    ]);

    return {
      following: followOut?.state === 'active',
      followRequested: followOut?.state === 'pending',
      followedBy: followIn !== null,
      blocked: block !== null,
      muted: mute !== null,
    };
  }

  private async paginateUserList(
    direction: 'follower' | 'following',
    userId: string,
    _viewerId: string | null,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPageDto<UserCardDto>> {
    const safeLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);

    // direction === 'follower' → find users who follow userId
    // direction === 'following' → find users whom userId follows
    const filterCol = direction === 'follower' ? 'followee_id' : 'follower_id';
    const selectCol = direction === 'follower' ? 'follower_id' : 'followee_id';

    let qb = this.userRepo
      .createQueryBuilder('u')
      .innerJoin(
        'follows',
        'f',
        `f.${selectCol} = u.id AND f.${filterCol} = :userId AND f.state = 'active'`,
        { userId },
      )
      .orderBy('f.created_at', 'DESC')
      .limit(safeLimit + 1);

    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      if (decoded.type !== 'id') throw new BadRequestException('Invalid cursor');
      // Cursor is based on f.created_at < pivot; use the user id to find the pivot row
      qb = qb.andWhere(
        `f.created_at < (SELECT created_at FROM follows WHERE ${selectCol} = :cid AND ${filterCol} = :userId)`,
        { cid: decoded.id },
      );
    }

    const users = await qb.getMany();
    const hasMore = users.length > safeLimit;
    const page = users.slice(0, safeLimit);

    const items = page.map((u) => UserCardDto.fromEntity(u));
    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;

    return CursorPageDto.of(items, nextCursor, hasMore);
  }

  private parseRequestId(requestId: string): { followerId: string; followeeId: string } {
    const parts = requestId.split(':');
    if (parts.length !== 2) {
      throw new BadRequestException({
        error: { code: 'INVALID_REQUEST_ID', message: 'Invalid follow request ID.' },
      });
    }
    return { followerId: parts[0], followeeId: parts[1] };
  }
}
