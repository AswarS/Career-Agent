import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

export type IntegrationOutboxStatus = "pending" | "published" | "failed";

@Entity("integration_outbox")
@Index("IDX_integration_outbox_status_available", [
  "status",
  "availableAt",
  "createdAt",
])
export class IntegrationOutboxEntity {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "varchar", length: 100 })
  eventType!: string;

  @Column({ type: "varchar", length: 100 })
  aggregateType!: string;

  @Column({ type: "varchar", length: 200 })
  aggregateId!: string;

  @Column({ type: "integer" })
  aggregateVersion!: number;

  @Column({ type: "text" })
  payloadJson!: string;

  @Column({ type: "varchar", default: "pending" })
  status!: IntegrationOutboxStatus;

  @Column({ type: "integer", default: 0 })
  attempts!: number;

  @Column({ type: "datetime", nullable: true })
  availableAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "datetime", nullable: true })
  publishedAt!: Date | null;
}
