import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ProfileProjectionJobStatus = 'pending' | 'completed' | 'failed';

@Entity('profile_projection_jobs')
@Index(['userId', 'status', 'targetVersion'])
export class ProfileProjectionJobEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'integer' })
  targetVersion!: number;

  @Column({ type: 'varchar', default: 'pending' })
  status!: ProfileProjectionJobStatus;

  @Column({ type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
