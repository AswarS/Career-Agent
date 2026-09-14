import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneratedAppArtifacts1785128066000 implements MigrationInterface {
  name = 'GeneratedAppArtifacts1785128066000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "generated_apps" ADD COLUMN "appId" varchar`);
    await queryRunner.query(`ALTER TABLE "generated_apps" ADD COLUMN "artifactId" integer`);
    await queryRunner.query(`ALTER TABLE "generated_apps" ADD COLUMN "version" integer NOT NULL DEFAULT (1)`);
    await queryRunner.query(`ALTER TABLE "generated_apps" ADD COLUMN "logicalObjectId" varchar`);
    await queryRunner.query(`ALTER TABLE "generated_apps" ADD COLUMN "previousGeneratedAppId" integer`);
    await queryRunner.query(
      'CREATE INDEX "IDX_generated_apps_appId" ON "generated_apps" ("appId")',
    );

    await queryRunner.query(`CREATE TABLE "generated_app_events" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "userId" integer NOT NULL,
      "appId" varchar NOT NULL,
      "sessionId" varchar NOT NULL,
      "seq" integer NOT NULL,
      "type" varchar NOT NULL,
      "at" datetime NOT NULL,
      "dataJson" text,
      "feedbackJson" text,
      "payloadHash" varchar(64) NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_generated_app_events_app_session_seq" ON "generated_app_events" ("appId", "sessionId", "seq")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_generated_app_events_app_created" ON "generated_app_events" ("appId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_generated_app_events_user_created" ON "generated_app_events" ("userId", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_generated_app_events_user_created"');
    await queryRunner.query('DROP INDEX "IDX_generated_app_events_app_created"');
    await queryRunner.query('DROP INDEX "IDX_generated_app_events_app_session_seq"');
    await queryRunner.query('DROP TABLE "generated_app_events"');
    await queryRunner.query('DROP INDEX "IDX_generated_apps_appId"');
    // SQLite cannot drop columns; the added generated_apps columns remain.
  }
}
