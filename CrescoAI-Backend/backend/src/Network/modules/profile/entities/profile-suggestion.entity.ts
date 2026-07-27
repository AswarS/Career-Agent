import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ProfileSuggestionStatus = 'pending' | 'accepted' | 'rejected';

@Entity('profile_suggestions')
@Index(
  'IDX_profile_suggestions_user_status_created',
  ['userId', 'status', 'createdAt'],
)
export class ProfileSuggestionEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  rowId!: number;

  @Column({ type: 'varchar' })
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  rationale!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceThreadId!: string | null;

  @Column({ type: 'text' })
  patchJson!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: ProfileSuggestionStatus;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
