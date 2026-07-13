import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('profile_revisions')
@Index(['userId', 'aggregateVersion'])
export class ProfileRevisionEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'integer' })
  aggregateVersion!: number;

  @Column({ type: 'varchar' })
  targetType!: string;

  @Column({ type: 'varchar', nullable: true })
  targetId!: string | null;

  @Column({ type: 'varchar' })
  operation!: string;

  @Column({ type: 'text', nullable: true })
  beforeJson!: string | null;

  @Column({ type: 'text', nullable: true })
  afterJson!: string | null;

  @Column({ type: 'varchar' })
  sourceType!: string;

  @Column({ type: 'varchar' })
  updateLevel!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceConversationId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceMessageId!: string | null;

  @Column({ type: 'boolean', default: false })
  userConfirmed!: boolean;

  @Column({ type: 'varchar', default: 'system' })
  actorType!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
