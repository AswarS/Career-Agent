import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ProfileProjectionStatus = 'current' | 'pending' | 'failed';

@Entity('profile_states')
@Index(['userId'], { unique: true })
export class ProfileStateEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'integer', default: 1 })
  aggregateVersion!: number;

  @Column({ type: 'integer', default: 0 })
  projectionVersion!: number;

  @Column({ type: 'varchar', default: 'pending' })
  projectionStatus!: ProfileProjectionStatus;

  @Column({ type: 'integer', default: 1 })
  nextProfileIndex!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
