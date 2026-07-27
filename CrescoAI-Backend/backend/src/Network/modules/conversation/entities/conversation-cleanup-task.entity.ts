import { Column, Entity, Index, PrimaryColumn } from "typeorm";

export type ConversationCleanupTaskStatus =
  | "pending"
  | "running"
  | "failed"
  | "completed";

@Entity("conversation_cleanup_tasks")
@Index("IDX_conversation_cleanup_tasks_status", ["status", "createdAt"])
export class ConversationCleanupTaskEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "integer" })
  userId!: number;

  @Column({ type: "text" })
  conversationId!: string;

  @Column({ type: "text", default: "pending" })
  status!: ConversationCleanupTaskStatus;

  @Column({ type: "integer", default: 0 })
  attempts!: number;

  @Column({ type: "text", nullable: true })
  lastError!: string | null;

  @Column({ type: "datetime" })
  createdAt!: Date;

  @Column({ type: "datetime" })
  updatedAt!: Date;

  @Column({ type: "datetime", nullable: true })
  completedAt!: Date | null;
}
