import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileEvidenceLinks1785128063000 implements MigrationInterface {
  name = 'ProfileEvidenceLinks1785128063000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "profile_evidence_links" (
      "id" varchar PRIMARY KEY NOT NULL, "publicRef" varchar NOT NULL,
      "userId" integer NOT NULL, "targetType" varchar NOT NULL,
      "fieldKey" varchar NOT NULL, "profileMemoryItemId" varchar,
      "profileItemVersion" integer, "valueKey" varchar,
      "conversationId" varchar NOT NULL, "sourceMessageId" varchar,
      "evidenceUnitId" varchar, "contentHash" varchar NOT NULL,
      "summaryRevision" integer, "sourceUpdatedAt" datetime,
      "evidenceStrength" varchar NOT NULL, "origin" varchar NOT NULL,
      "status" varchar NOT NULL DEFAULT ('active'), "invalidatedReason" varchar,
      "refreshJobId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_profile_evidence_public_ref" ON "profile_evidence_links" ("publicRef")');
    await queryRunner.query('CREATE INDEX "IDX_profile_evidence_target" ON "profile_evidence_links" ("userId", "fieldKey", "valueKey", "status")');
    await queryRunner.query('CREATE INDEX "IDX_profile_evidence_conversation" ON "profile_evidence_links" ("userId", "conversationId", "status")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_profile_evidence_conversation"');
    await queryRunner.query('DROP INDEX "IDX_profile_evidence_target"');
    await queryRunner.query('DROP INDEX "IDX_profile_evidence_public_ref"');
    await queryRunner.query('DROP TABLE "profile_evidence_links"');
  }
}
