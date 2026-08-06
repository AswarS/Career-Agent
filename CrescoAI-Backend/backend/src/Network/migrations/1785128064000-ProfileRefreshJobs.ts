import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileRefreshJobs1785128064000 implements MigrationInterface {
  name = 'ProfileRefreshJobs1785128064000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "profile_refresh_jobs" (
      "id" varchar PRIMARY KEY NOT NULL, "publicJobId" varchar NOT NULL,
      "userId" integer NOT NULL, "clientRequestId" varchar,
      "status" varchar NOT NULL DEFAULT ('queued'), "profileVersionBefore" integer,
      "profileVersionAfter" integer, "coverage" varchar NOT NULL DEFAULT ('unavailable'),
      "candidateCount" integer NOT NULL DEFAULT (0), "selectedEvidenceCount" integer NOT NULL DEFAULT (0),
      "addedCount" integer NOT NULL DEFAULT (0), "updatedCount" integer NOT NULL DEFAULT (0),
      "verifiedCount" integer NOT NULL DEFAULT (0), "removedCount" integer NOT NULL DEFAULT (0),
      "unchangedCount" integer NOT NULL DEFAULT (0), "skippedCount" integer NOT NULL DEFAULT (0),
      "errorCode" varchar, "startedAt" datetime, "completedAt" datetime,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_profile_refresh_public_id" ON "profile_refresh_jobs" ("publicJobId")');
    await queryRunner.query('CREATE INDEX "IDX_profile_refresh_status" ON "profile_refresh_jobs" ("userId", "status", "createdAt")');
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_profile_refresh_client_request" ON "profile_refresh_jobs" ("userId", "clientRequestId")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_profile_refresh_client_request"');
    await queryRunner.query('DROP INDEX "IDX_profile_refresh_status"');
    await queryRunner.query('DROP INDEX "IDX_profile_refresh_public_id"');
    await queryRunner.query('DROP TABLE "profile_refresh_jobs"');
  }
}
