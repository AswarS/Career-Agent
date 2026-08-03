import { createHash, randomUUID } from "node:crypto";
import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from "typeorm";

const PUBLIC_USER_ID_IMMUTABLE_TRIGGER = "TRG_users_publicUserId_immutable";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function serializeProfile(raw: string, userId: number) {
  try {
    return JSON.stringify(canonicalize(JSON.parse(raw) as unknown));
  } catch {
    throw new Error(
      `users.profileJson contains invalid JSON for user ${userId}`,
    );
  }
}

async function addUserColumnIfMissing(
  queryRunner: QueryRunner,
  column: TableColumn,
) {
  const users = await queryRunner.getTable("users");
  if (!users) {
    throw new Error("users table is missing");
  }
  if (!users.findColumnByName(column.name)) {
    await queryRunner.addColumn("users", column);
  }
}

async function recreatePublicUserIdTrigger(queryRunner: QueryRunner) {
  await queryRunner.query(`
    CREATE TRIGGER IF NOT EXISTS "${PUBLIC_USER_ID_IMMUTABLE_TRIGGER}"
    BEFORE UPDATE OF "publicUserId" ON "users"
    FOR EACH ROW
    WHEN OLD."publicUserId" <> NEW."publicUserId"
    BEGIN
      SELECT RAISE(ABORT, 'publicUserId is immutable');
    END
  `);
}

export class AddIntegrationKernel1785128060000 implements MigrationInterface {
  name = "AddIntegrationKernel1785128060000";

  async up(queryRunner: QueryRunner) {
    for (const column of [
      new TableColumn({
        name: "accountStatus",
        type: "varchar",
        default: "'active'",
      }),
      new TableColumn({
        name: "accountVersion",
        type: "integer",
        default: 1,
      }),
      new TableColumn({
        name: "profileVersion",
        type: "integer",
        default: 0,
      }),
      new TableColumn({
        name: "currentProfileVersionId",
        type: "varchar",
        length: "36",
        isNullable: true,
      }),
    ]) {
      await addUserColumnIfMissing(queryRunner, column);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "career_profile_versions" (
        "id" varchar(36) PRIMARY KEY NOT NULL,
        "userId" integer NOT NULL,
        "version" integer NOT NULL,
        "schemaVersion" varchar(100) NOT NULL,
        "profileJson" text NOT NULL,
        "contentHash" varchar(64) NOT NULL,
        "createdBy" varchar(100) NOT NULL,
        "sourceThreadId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_7aa4d0a42c32b7b1d70f5f6561f" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_career_profile_versions_user_version_unique"
      ON "career_profile_versions" ("userId", "version")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_career_profile_versions_user"
      ON "career_profile_versions" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_career_profile_versions_user_hash"
      ON "career_profile_versions" ("userId", "contentHash")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "integration_outbox" (
        "id" varchar(36) PRIMARY KEY NOT NULL,
        "eventType" varchar(100) NOT NULL,
        "aggregateType" varchar(100) NOT NULL,
        "aggregateId" varchar(200) NOT NULL,
        "aggregateVersion" integer NOT NULL,
        "payloadJson" text NOT NULL,
        "status" varchar NOT NULL DEFAULT ('pending'),
        "attempts" integer NOT NULL DEFAULT (0),
        "availableAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "publishedAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_integration_outbox_status_available"
      ON "integration_outbox" ("status", "availableAt", "createdAt")
    `);

    const users = (await queryRunner.query(`
      SELECT
        "id",
        "profileJson",
        "updatedAt",
        "currentProfileVersionId"
      FROM "users"
      ORDER BY "id"
    `)) as Array<{
      id: number;
      profileJson: string;
      updatedAt: string;
      currentProfileVersionId: string | null;
    }>;
    for (const user of users) {
      if (user.currentProfileVersionId) {
        continue;
      }
      const profileJson = serializeProfile(user.profileJson, user.id);
      const parsed = JSON.parse(profileJson) as Record<string, unknown>;
      const schemaVersion =
        typeof parsed.schemaVersion === "string"
          ? parsed.schemaVersion
          : "career_profile_v1";
      const contentHash = createHash("sha256")
        .update(profileJson)
        .digest("hex");
      const profileVersionId = randomUUID();
      await queryRunner.query(
        `
          INSERT INTO "career_profile_versions" (
            "id",
            "userId",
            "version",
            "schemaVersion",
            "profileJson",
            "contentHash",
            "createdBy",
            "sourceThreadId",
            "createdAt"
          )
          VALUES (?, ?, 1, ?, ?, ?, 'migration', NULL, ?)
        `,
        [
          profileVersionId,
          user.id,
          schemaVersion,
          profileJson,
          contentHash,
          user.updatedAt,
        ],
      );
      await queryRunner.query(
        `
          UPDATE "users"
          SET
            "profileJson" = ?,
            "profileVersion" = 1,
            "currentProfileVersionId" = ?
          WHERE "id" = ?
        `,
        [profileJson, profileVersionId, user.id],
      );
    }

    await recreatePublicUserIdTrigger(queryRunner);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS "integration_outbox"');
    await queryRunner.query('DROP TABLE IF EXISTS "career_profile_versions"');
    for (const columnName of [
      "currentProfileVersionId",
      "profileVersion",
      "accountVersion",
      "accountStatus",
    ]) {
      const users = await queryRunner.getTable("users");
      if (users?.findColumnByName(columnName)) {
        await queryRunner.dropColumn("users", columnName);
      }
    }
    await recreatePublicUserIdTrigger(queryRunner);
  }
}
