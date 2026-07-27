import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileMemory1760000001000 implements MigrationInterface {
  name = 'ProfileMemory1760000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_memory_items" (
      "id" varchar PRIMARY KEY NOT NULL,
      "userId" integer NOT NULL,
      "content" text NOT NULL,
      "normalizedKey" varchar NOT NULL,
      "category" varchar NOT NULL,
      "slotKey" varchar NOT NULL DEFAULT (''),
      "appliesToJson" text NOT NULL DEFAULT ('[]'),
      "timeScope" varchar NOT NULL,
      "priority" varchar NOT NULL,
      "confidence" float NOT NULL DEFAULT (1),
      "sourceType" varchar NOT NULL,
      "sourceConversationId" varchar,
      "sourceMessageId" varchar,
      "status" varchar NOT NULL DEFAULT ('active'),
      "expiresAt" datetime,
      "supersedesId" varchar,
      "version" integer NOT NULL DEFAULT (1),
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_profile_memory_status_scope" ON "profile_memory_items" ("userId", "status", "timeScope")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_profile_memory_dedup" ON "profile_memory_items" ("userId", "normalizedKey", "status")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_profile_memory_slot" ON "profile_memory_items" ("userId", "slotKey", "status")');

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_projection_jobs" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "userId" integer NOT NULL,
      "targetVersion" integer NOT NULL,
      "status" varchar NOT NULL DEFAULT ('pending'),
      "retryCount" integer NOT NULL DEFAULT (0),
      "lastError" text,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_profile_projection_queue" ON "profile_projection_jobs" ("userId", "status", "targetVersion")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "profile_projection_jobs"');
    await queryRunner.query('DROP TABLE IF EXISTS "profile_memory_items"');
  }
}
