import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('mutes')
@Index(['mutedId'])
export class Mute {
  @PrimaryColumn({ name: 'muter_id', type: 'uuid' })
  muterId!: string;

  @PrimaryColumn({ name: 'muted_id', type: 'uuid' })
  mutedId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muter_id' })
  muter?: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muted_id' })
  muted?: User;
}
