import { User } from '../user.entity';

/**
 * UserCardDto — compact user shape used in lists (followers, following,
 * notifications, reposts, likes, etc.).
 * Matches docs/api-contract.md UserCardDto shape.
 */
export class UserCardDto {
  id!: string;
  handle!: string;
  displayName!: string;
  avatarUrl!: string | null;
  isVerified!: boolean;
  isPrivate!: boolean;

  static fromEntity(user: User): UserCardDto {
    const dto = new UserCardDto();
    dto.id = user.id;
    dto.handle = user.handle;
    dto.displayName = user.displayName;
    // avatarUrl: resolved from media table in Phase 6; null until then
    dto.avatarUrl = null;
    dto.isVerified = user.isVerified;
    dto.isPrivate = user.isPrivate;
    return dto;
  }
}
