import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProfileRefreshJobStatus =
  | 'queued' | 'collecting' | 'running' | 'applying'
  | 'succeeded' | 'partial' | 'failed' | 'cancelled';
export type ProfileRefreshCoverage = 'complete' | 'bounded' | 'unavailable';

@Entity('profile_refresh_jobs')
@Index(['publicJobId'], { unique: true })
@Index(['userId', 'status', 'createdAt'])
@Index(['userId', 'clientRequestId'], { unique: true })
export class ProfileRefreshJobEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  publicJobId!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', nullable: true })
  clientRequestId!: string | null;

  @Column({ type: 'varchar', default: 'queued' })
  status!: ProfileRefreshJobStatus;

  @Column({ type: 'integer', nullable: true })
  profileVersionBefore!: number | null;

  @Column({ type: 'integer', nullable: true })
  profileVersionAfter!: number | null;

  @Column({ type: 'varchar', default: 'unavailable' })
  coverage!: ProfileRefreshCoverage;

  @Column({ type: 'integer', default: 0 }) candidateCount!: number;
  @Column({ type: 'integer', default: 0 }) selectedEvidenceCount!: number;
  @Column({ type: 'integer', default: 0 }) addedCount!: number;
  @Column({ type: 'integer', default: 0 }) updatedCount!: number;
  @Column({ type: 'integer', default: 0 }) verifiedCount!: number;
  @Column({ type: 'integer', default: 0 }) removedCount!: number;
  @Column({ type: 'integer', default: 0 }) unchangedCount!: number;
  @Column({ type: 'integer', default: 0 }) skippedCount!: number;

  @Column({ type: 'varchar', nullable: true })
  errorCode!: string | null;

  @Column({ type: 'datetime', nullable: true }) startedAt!: Date | null;
  @Column({ type: 'datetime', nullable: true }) completedAt!: Date | null;

  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
