import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PraxisBehaviorEvents1785128065000 implements MigrationInterface {
  name = 'PraxisBehaviorEvents1785128065000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "praxis_behavior_events" (
      "eventId" varchar PRIMARY KEY NOT NULL,
      "userId" integer NOT NULL,
      "schemaVersion" varchar NOT NULL,
      "eventType" varchar NOT NULL,
      "actorType" varchar NOT NULL,
      "occurredAt" datetime NOT NULL,
      "traceId" varchar NOT NULL,
      "sourceEventId" varchar,
      "outcome" varchar NOT NULL,
      "resourceRefsJson" text NOT NULL,
      "factsJson" text NOT NULL,
      "payloadJson" text NOT NULL,
      "payloadHash" varchar(64) NOT NULL,
      "evidenceDisposition" varchar NOT NULL,
      "evidenceCategory" varchar,
      "evidenceReason" varchar NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_praxis_behavior_user_occurred" ON "praxis_behavior_events" ("userId", "occurredAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_praxis_behavior_evidence_created" ON "praxis_behavior_events" ("evidenceDisposition", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_praxis_behavior_evidence_created"');
    await queryRunner.query('DROP INDEX "IDX_praxis_behavior_user_occurred"');
    await queryRunner.query('DROP TABLE "praxis_behavior_events"');
  }
}
