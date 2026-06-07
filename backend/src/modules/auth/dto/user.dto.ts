import { User } from '../../users/user.entity';

/**
 * UserDto — canonical shape for the authenticated user object in auth responses.
 * Matches the contract table in docs/api-contract.md.
 */
export class UserDto {
  id!: string;
  handle!: string;
  displayName!: string;
  email!: string;
  avatarUrl!: string | null;
  isVerified!: boolean;
  isPrivate!: boolean;
  dmPrivacy!: 'everyone' | 'following';
  createdAt!: string;

  static fromEntity(user: User): UserDto {
    const dto = new UserDto();
    dto.id = user.id;
    dto.handle = user.handle;
    dto.displayName = user.displayName;
    dto.email = user.email;
    // avatarUrl resolution (media URL) deferred to Phase 6; null until then
    dto.avatarUrl = null;
    dto.isVerified = user.isVerified;
    dto.isPrivate = user.isPrivate;
    dto.dmPrivacy = user.dmPrivacy;
    dto.createdAt = user.createdAt.toISOString();
    return dto;
  }
}
