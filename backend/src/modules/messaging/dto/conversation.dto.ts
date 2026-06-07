import { MessageDto } from './message.dto';

export class ParticipantDto {
  id!: string;
  handle!: string;
  displayName!: string;
  avatarUrl!: string | null;
  isVerified!: boolean;
  isPrivate!: boolean;
}

/**
 * ConversationDto — canonical response shape for a DM conversation.
 * Matches the API contract ConversationDto spec.
 */
export class ConversationDto {
  id!: string;
  participants!: ParticipantDto[];
  lastMessage!: MessageDto | null;
  unreadCount!: number;
  muted!: boolean;
  createdAt!: string;
}
