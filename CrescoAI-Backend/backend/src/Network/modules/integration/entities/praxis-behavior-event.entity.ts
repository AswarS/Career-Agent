import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type {
  PraxisBehaviorEvidenceCategory,
  PraxisBehaviorEvidenceDisposition,
} from '../praxis-behavior-event.types';

@Entity('praxis_behavior_events')
@Index('IDX_praxis_behavior_user_occurred', ['userId', 'occurredAt'])
@Index('IDX_praxis_behavior_evidence_created', [
  'evidenceDisposition',
  'createdAt',
])
export class PraxisBehaviorEventEntity {
  @PrimaryColumn({ type: 'varchar' })
  eventId!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar' })
  schemaVersion!: string;

  @Column({ type: 'varchar' })
  eventType!: string;

  @Column({ type: 'varchar' })
  actorType!: string;

  @Column({ type: 'datetime' })
  occurredAt!: Date;

  @Column({ type: 'varchar' })
  traceId!: string;

  @Column({ type: 'varchar', nullable: true })
  sourceEventId!: string | null;

  @Column({ type: 'varchar' })
  outcome!: string;

  @Column({ type: 'text' })
  resourceRefsJson!: string;

  @Column({ type: 'text' })
  factsJson!: string;

  @Column({ type: 'text' })
  payloadJson!: string;

  @Column({ type: 'varchar', length: 64 })
  payloadHash!: string;

  @Column({ type: 'varchar' })
  evidenceDisposition!: PraxisBehaviorEvidenceDisposition;

  @Column({ type: 'varchar', nullable: true })
  evidenceCategory!: PraxisBehaviorEvidenceCategory | null;

  @Column({ type: 'varchar' })
  evidenceReason!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
