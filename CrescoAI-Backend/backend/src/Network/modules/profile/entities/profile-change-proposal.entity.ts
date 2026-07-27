import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type {
  ProfileProposalOperation,
  ProfileProposalStatus,
  ProfileTargetType,
  ProfileUpdateLevel,
} from '../profile-v2.types';

@Entity('profile_change_proposals')
@Index(['userId', 'status', 'createdAt'])
@Index(['userId', 'idempotencyKey'], { unique: true })
export class ProfileChangeProposalEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  targetType!: ProfileTargetType;

  @Column({ type: 'varchar' })
  operation!: ProfileProposalOperation;

  @Column({ type: 'text' })
  candidateJson!: string;

  @Column({ type: 'text', nullable: true })
  currentValueJson!: string | null;

  @Column({ type: 'text', default: '[]' })
  conflictIdsJson!: string;

  @Column({ type: 'text' })
  rationale!: string;

  @Column({ type: 'varchar' })
  updateLevel!: ProfileUpdateLevel;

  @Column({ type: 'boolean', default: false })
  confirmationRequired!: boolean;

  @Column({ type: 'varchar', default: 'pending' })
  status!: ProfileProposalStatus;

  @Column({ type: 'varchar', nullable: true })
  sourceConversationId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceMessageId!: string | null;

  @Column({ type: 'integer' })
  baseVersion!: number;

  @Column({ type: 'varchar' })
  idempotencyKey!: string;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
