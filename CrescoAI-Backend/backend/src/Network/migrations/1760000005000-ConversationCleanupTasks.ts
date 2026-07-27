import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationCleanupTasks1760000005000
  implements MigrationInterface
{
  name = 'ConversationCleanupTasks1760000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_cleanup_tasks" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" integer NOT NULL,
        "conversationId" text NOT NULL,
        "status" text NOT NULL DEFAULT ('pending'),
        "attempts" integer NOT NULL DEFAULT (0),
        "lastError" text,
        "createdAt" datetime NOT NULL,
        "updatedAt" datetime NOT NULL,
        "completedAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_cleanup_tasks_status"
      ON "conversation_cleanup_tasks" ("status", "createdAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_conversation_cleanup_tasks_status"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "conversation_cleanup_tasks"',
    );
  }
}
