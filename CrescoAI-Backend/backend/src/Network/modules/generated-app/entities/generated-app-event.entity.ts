import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('generated_app_events')
@Index(
  'IDX_generated_app_events_app_session_seq',
  ['appId', 'sessionId', 'seq'],
  { unique: true },
)
@Index('IDX_generated_app_events_app_created', ['appId', 'createdAt'])
@Index('IDX_generated_app_events_user_created', ['userId', 'createdAt'])
export class GeneratedAppEventEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  appId!: string;

  @Column({ type: 'varchar' })
  sessionId!: string;

  @Column({ type: 'integer' })
  seq!: number;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'datetime' })
  at!: Date;

  @Column({ type: 'text', nullable: true })
  dataJson?: string;

  /** Present only on the last event row of a batch that carried feedback. */
  @Column({ type: 'text', nullable: true })
  feedbackJson?: string;

  @Column({ type: 'varchar', length: 64 })
  payloadHash!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
