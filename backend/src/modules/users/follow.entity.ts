import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

export type FollowState = 'active' | 'pending';

@Entity('follows')
@Index(['followeeId', 'followerId'])
export class Follow {
  @PrimaryColumn({ name: 'follower_id', type: 'uuid' })
  followerId!: string;

  @PrimaryColumn({ name: 'followee_id', type: 'uuid' })
  followeeId!: string;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'active',
  })
  state!: FollowState;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'follower_id' })
  follower?: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followee_id' })
  followee?: User;
}
