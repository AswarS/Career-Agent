import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_settings')
@Index(['userId', 'provider'], { unique: true })
export class UserSettingEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Index()
  @Column({ type: 'integer' })
  userId!: number;

  @Column({ default: 'anthropic' })
  provider!: string;

  @Column({ type: 'text', nullable: true, select: false })
  apiKeyEncrypted?: string | null;

  @Column({ nullable: true })
  apiKeyFingerprint?: string | null;

  @Column({ nullable: true })
  apiKeyHint?: string | null;

  @Column({ nullable: true })
  model?: string | null;

  @Column({ nullable: true })
  baseUrl?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
