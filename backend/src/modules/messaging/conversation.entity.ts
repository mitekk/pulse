import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  /** Snowflake BIGINT — serialized as string */
  @PrimaryColumn({ type: 'bigint', transformer: { to: (v: string) => v, from: (v: string) => v } })
  id!: string;

  @Column({ name: 'is_group', type: 'boolean', default: false })
  isGroup!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => ConversationParticipant, (p) => p.conversation)
  participants!: ConversationParticipant[];

  @OneToMany(() => Message, (m) => m.conversation)
  messages!: Message[];
}
