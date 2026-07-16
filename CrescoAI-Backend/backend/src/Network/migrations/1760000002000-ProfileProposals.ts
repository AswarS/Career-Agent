import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileProposals1760000002000 implements MigrationInterface {
  name = 'ProfileProposals1760000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_change_proposals" (
      "id" varchar PRIMARY KEY NOT NULL,
      "userId" integer NOT NULL,
      "targetType" varchar NOT NULL,
      "operation" varchar NOT NULL,
      "candidateJson" text NOT NULL,
      "currentValueJson" text,
      "conflictIdsJson" text NOT NULL DEFAULT ('[]'),
      "rationale" text NOT NULL,
      "updateLevel" varchar NOT NULL,
      "confirmationRequired" boolean NOT NULL DEFAULT (0),
      "status" varchar NOT NULL DEFAULT ('pending'),
      "sourceConversationId" varchar,
      "sourceMessageId" varchar,
      "baseVersion" integer NOT NULL,
      "idempotencyKey" varchar NOT NULL,
      "resolvedAt" datetime,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_profile_proposals_status" ON "profile_change_proposals" ("userId", "status", "createdAt")');
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_profile_proposals_idempotency" ON "profile_change_proposals" ("userId", "idempotencyKey")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "profile_change_proposals"');
  }
}
