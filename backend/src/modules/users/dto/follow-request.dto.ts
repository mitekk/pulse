import { Follow } from '../follow.entity';
import { UserCardDto } from './user-card.dto';
import { User } from '../user.entity';

/**
 * FollowRequestDto — shape returned in GET /api/v1/follow-requests list.
 * Matches docs/api-contract.md FollowRequestDto shape.
 */
export class FollowRequestDto {
  /** Composite PK encoded as "followerId:followeeId" — used in accept/decline paths */
  id!: string;
  requester!: UserCardDto;
  createdAt!: string;

  static fromFollow(follow: Follow, requesterUser: User): FollowRequestDto {
    const dto = new FollowRequestDto();
    // Encode a stable string ID from the composite PK for the follow-requests/:id paths
    dto.id = `${follow.followerId}:${follow.followeeId}`;
    dto.requester = UserCardDto.fromEntity(requesterUser);
    dto.createdAt = follow.createdAt.toISOString();
    return dto;
  }
}
