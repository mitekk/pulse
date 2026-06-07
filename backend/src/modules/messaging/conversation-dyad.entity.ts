import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../users/user.entity';

/**
 * ConversationDyad — canonical 1:1 conversation lookup table.
 *
 * user_lo and user_hi are always ordered so user_lo < user_hi (UUID lexicographic).
 * This enforces a single row per pair, regardless of who initiated the conversation.
 */
@Entity('conversation_dyads')
export class ConversationDyad {
  @PrimaryColumn({ name: 'user_lo', type: 'uuid' })
  userLo!: string;

  @PrimaryColumn({ name: 'user_hi', type: 'uuid' })
  userHi!: string;

  @Column({
    name: 'conversation_id',
    type: 'bigint',
    transformer: { to: (v: string) => v, from: (v: string) => v },
  })
  conversationId!: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_lo' })
  lo!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_hi' })
  hi!: User;
}
