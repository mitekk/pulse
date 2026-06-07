import { User } from '../user.entity';

export interface ViewerRelationship {
  following: boolean;
  followedBy: boolean;
  blocked: boolean;
  muted: boolean;
  followRequested: boolean;
}

/**
 * ProfileDto — full profile shape returned by GET /api/v1/users/:handle.
 * Includes relationship flags from the viewer's perspective.
 * Matches docs/api-contract.md ProfileDto shape exactly.
 */
export class ProfileDto {
  id!: string;
  handle!: string;
  displayName!: string;
  bio!: string | null;
  location!: string | null;
  website!: string | null;
  avatarUrl!: string | null;
  bannerUrl!: string | null;
  isVerified!: boolean;
  isPrivate!: boolean;
  counts!: {
    followers: number;
    following: number;
    posts: number;
  };
  viewer!: ViewerRelationship;
  createdAt!: string;

  static fromEntity(user: User, viewer: ViewerRelationship): ProfileDto {
    const dto = new ProfileDto();
    dto.id = user.id;
    dto.handle = user.handle;
    dto.displayName = user.displayName;
    dto.bio = user.bio;
    dto.location = user.location;
    dto.website = user.website;
    // avatarUrl / bannerUrl: resolved from media table in Phase 6; null until then
    dto.avatarUrl = null;
    dto.bannerUrl = null;
    dto.isVerified = user.isVerified;
    dto.isPrivate = user.isPrivate;
    dto.counts = {
      followers: user.followersCount,
      following: user.followingCount,
      posts: user.postsCount,
    };
    dto.viewer = viewer;
    dto.createdAt = user.createdAt.toISOString();
    return dto;
  }
}
