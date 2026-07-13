import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ProfileMemoryStatus,
  ProfilePriority,
  ProfileSourceType,
  ProfileTimeScope,
} from '../profile-v2.types';

@Entity('profile_memory_items')
@Index(['userId', 'status', 'timeScope'])
@Index(['userId', 'normalizedKey', 'status'])
@Index(['userId', 'slotKey', 'status'])
export class ProfileMemoryItemEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar' })
  normalizedKey!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'varchar', default: '' })
  slotKey!: string;

  @Column({ type: 'text', default: '[]' })
  appliesToJson!: string;

  @Column({ type: 'varchar' })
  timeScope!: ProfileTimeScope;

  @Column({ type: 'varchar' })
  priority!: ProfilePriority;

  @Column({ type: 'varchar' })
  sourceType!: ProfileSourceType;

  @Column({ type: 'varchar', nullable: true })
  sourceConversationId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceMessageId!: string | null;

  @Column({ type: 'varchar', default: 'active' })
  status!: ProfileMemoryStatus;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  supersedesId!: string | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
