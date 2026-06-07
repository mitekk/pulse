import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../users/user.entity';

@Entity('conversation_participants')
export class ConversationParticipant {
  @PrimaryColumn({
    name: 'conversation_id',
    type: 'bigint',
    transformer: { to: (v: string) => v, from: (v: string) => v },
  })
  conversationId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** Nullable bigint — ID of the last message the user has read */
  @Column({
    name: 'last_read_message_id',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: string | null) => v,
      from: (v: string | null) => v,
    },
  })
  lastReadMessageId!: string | null;

  @Column({ type: 'boolean', default: false })
  muted!: boolean;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @ManyToOne(() => Conversation, (c) => c.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
