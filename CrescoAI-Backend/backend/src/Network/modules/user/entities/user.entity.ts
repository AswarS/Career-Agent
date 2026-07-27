import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ nullable: true })
  userId?: string;

  /**
   * Stable, opaque identifier exposed across API and module boundaries.
   *
   * `id` remains the internal database key. This column is temporarily
   * nullable so existing databases can be synchronized and backfilled safely
   * during a rolling upgrade.
   */
  @Index({ unique: true })
  @Column({ nullable: true, length: 36 })
  publicUserId?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  email?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true, select: false })
  passwordHash?: string;

  @Column({ type: 'text', default: '{}' })
  profileJson!: string;

  @Column({ nullable: true, select: false })
  refreshTokenHash?: string | null;

  @Column({ nullable: true })
  refreshTokenExpiresAt?: Date | null;

  @Column({ default: 0 })
  tokenVersion!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
