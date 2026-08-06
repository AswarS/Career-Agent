import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ProfileProductFieldKey } from '../profile-product.types';

export type ProfileEvidenceTargetType = 'base_field' | 'memory_value';
export type ProfileEvidenceStrength = 'user_explicit' | 'grounded_summary';
export type ProfileEvidenceOrigin = 'current_turn' | 'profile_refresh';
export type ProfileEvidenceStatus = 'active' | 'stale' | 'invalidated';

@Entity('profile_evidence_links')
@Index(['publicRef'], { unique: true })
@Index(['userId', 'fieldKey', 'valueKey', 'status'])
@Index(['userId', 'conversationId', 'status'])
export class ProfileEvidenceLinkEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  publicRef!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  targetType!: ProfileEvidenceTargetType;

  @Column({ type: 'varchar' })
  fieldKey!: ProfileProductFieldKey;

  @Column({ type: 'varchar', nullable: true })
  profileMemoryItemId!: string | null;

  @Column({ type: 'integer', nullable: true })
  profileItemVersion!: number | null;

  @Column({ type: 'varchar', nullable: true })
  valueKey!: string | null;

  @Column({ type: 'varchar' })
  conversationId!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceMessageId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  evidenceUnitId!: string | null;

  @Column({ type: 'varchar' })
  contentHash!: string;

  @Column({ type: 'integer', nullable: true })
  summaryRevision!: number | null;

  @Column({ type: 'datetime', nullable: true })
  sourceUpdatedAt!: Date | null;

  @Column({ type: 'varchar' })
  evidenceStrength!: ProfileEvidenceStrength;

  @Column({ type: 'varchar' })
  origin!: ProfileEvidenceOrigin;

  @Column({ type: 'varchar', default: 'active' })
  status!: ProfileEvidenceStatus;

  @Column({ type: 'varchar', nullable: true })
  invalidatedReason!: string | null;

  @Column({ type: 'varchar', nullable: true })
  refreshJobId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
