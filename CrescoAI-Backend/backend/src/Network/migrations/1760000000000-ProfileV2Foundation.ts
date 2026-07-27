import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileV2Foundation1760000000000 implements MigrationInterface {
  name = 'ProfileV2Foundation1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "user_profiles" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "userId" integer NOT NULL,
      "name" varchar NOT NULL DEFAULT (''),
      "gender" varchar NOT NULL DEFAULT (''),
      "birthDate" date,
      "educationLevel" varchar NOT NULL DEFAULT (''),
      "educationBackgroundJson" text NOT NULL DEFAULT ('[]'),
      "currentCity" varchar NOT NULL DEFAULT (''),
      "currentStatus" varchar NOT NULL DEFAULT (''),
      "currentRole" varchar NOT NULL DEFAULT (''),
      "currentIndustry" varchar NOT NULL DEFAULT (''),
      "yearsOfExperience" float,
      "contactLanguage" varchar NOT NULL DEFAULT (''),
      "version" integer NOT NULL DEFAULT (1),
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_profiles_user" ON "user_profiles" ("userId")',
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_states" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "userId" integer NOT NULL,
      "aggregateVersion" integer NOT NULL DEFAULT (1),
      "projectionVersion" integer NOT NULL DEFAULT (0),
      "projectionStatus" varchar NOT NULL DEFAULT ('pending'),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_profile_states_user" ON "profile_states" ("userId")',
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_revisions" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "userId" integer NOT NULL,
      "aggregateVersion" integer NOT NULL,
      "targetType" varchar NOT NULL,
      "targetId" varchar,
      "operation" varchar NOT NULL,
      "beforeJson" text,
      "afterJson" text,
      "sourceType" varchar NOT NULL,
      "updateLevel" varchar NOT NULL,
      "sourceConversationId" varchar,
      "sourceMessageId" varchar,
      "userConfirmed" boolean NOT NULL DEFAULT (0),
      "actorType" varchar NOT NULL DEFAULT ('system'),
      "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_profile_revisions_user_version" ON "profile_revisions" ("userId", "aggregateVersion")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "profile_revisions"');
    await queryRunner.query('DROP TABLE IF EXISTS "profile_states"');
    await queryRunner.query('DROP TABLE IF EXISTS "user_profiles"');
  }
}
