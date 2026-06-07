import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../users/user.entity';

@Entity('messages')
export class Message {
  /** Snowflake BIGINT — serialized as string */
  @PrimaryColumn({ type: 'bigint', transformer: { to: (v: string) => v, from: (v: string) => v } })
  id!: string;

  @Column({
    name: 'conversation_id',
    type: 'bigint',
    transformer: { to: (v: string) => v, from: (v: string) => v },
  })
  conversationId!: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({
    name: 'media_id',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: string | null) => v,
      from: (v: string | null) => v,
    },
  })
  mediaId!: string | null;

  /** Client-generated nonce for idempotency (max 128 chars) */
  @Column({ name: 'client_nonce', type: 'varchar', length: 128, unique: true })
  clientNonce!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Conversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender!: User;
}
