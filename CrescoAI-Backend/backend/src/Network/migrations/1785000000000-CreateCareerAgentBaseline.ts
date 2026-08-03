import type { MigrationInterface, QueryRunner } from "typeorm";

const infrastructureTables = new Set(["migrations", "typeorm_metadata"]);
// These tables are created by the upstream Profile V2 and conversation
// migrations, whose historical timestamps predate this baseline migration.
// They do not indicate a partially initialized legacy Career database.
const preBaselineTables = new Set([
  "user_profiles",
  "profile_states",
  "profile_revisions",
  "profile_memory_items",
  "profile_projection_jobs",
  "profile_change_proposals",
  "profile_memory_confidence_rollback",
  "profile_memory_index_rollback",
  "conversation_cleanup_tasks",
]);
const legacyRequiredColumns: Record<string, string[]> = {
  users: ["id", "profileJson", "tokenVersion", "createdAt", "updatedAt"],
  artifacts: ["id", "userId", "type", "createdAt"],
  conversations: ["cid", "id", "userId", "updatedAt", "createdAt"],
  messages: ["id", "userId", "conversationId", "createdAt"],
  teams: ["id", "userId", "name", "createdAt", "updatedAt"],
  memories: ["id", "userId", "content", "createdAt"],
  api_settings: ["id", "userId", "createdAt", "updatedAt"],
  resources: [
    "id",
    "userId",
    "conversationId",
    "messageId",
    "resourceId",
    "createdAt",
  ],
  generated_apps: ["id", "userId", "appName", "createdAt", "updatedAt"],
};
const optionalLegacyTables = new Set(["profile_suggestions"]);

async function validateLegacyTableIfPresent(
  queryRunner: QueryRunner,
  tableName: string,
  requiredColumns: string[],
) {
  if (!(await queryRunner.hasTable(tableName))) {
    return;
  }
  const columns = (await queryRunner.query(
    `PRAGMA table_info("${tableName}")`,
  )) as Array<{ name: string }>;
  const names = new Set(columns.map(({ name }) => name));
  const missing = requiredColumns.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(
      `unsupported legacy ${tableName} schema; missing columns: ${missing.join(", ")}`,
    );
  }
}

async function createUniqueIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  columnName: string,
  indexName: string,
) {
  const indexes = (await queryRunner.query(
    `PRAGMA index_list("${tableName}")`,
  )) as Array<{ name: string; unique: number }>;
  for (const index of indexes) {
    if (index.unique !== 1) {
      continue;
    }
    const columns = (await queryRunner.query(
      `PRAGMA index_info("${index.name}")`,
    )) as Array<{ name: string }>;
    if (columns.length === 1 && columns[0].name === columnName) {
      return;
    }
  }
  await queryRunner.query(
    `CREATE UNIQUE INDEX "${indexName}" ON "${tableName}" ("${columnName}")`,
  );
}

export class CreateCareerAgentBaseline1785000000000 implements MigrationInterface {
  name = "CreateCareerAgentBaseline1785000000000";

  async up(queryRunner: QueryRunner) {
    const tables = (await queryRunner.query(`
      SELECT "name"
      FROM "sqlite_master"
      WHERE "type" = 'table'
        AND "name" NOT LIKE 'sqlite_%'
    `)) as Array<{ name: string }>;
    const applicationTables = tables
      .map(({ name }) => name)
      .filter(
        (name) =>
          !infrastructureTables.has(name) && !preBaselineTables.has(name),
      );

    if (applicationTables.length > 0) {
      const expectedLegacyTables = Object.keys(legacyRequiredColumns);
      const unknownTables = applicationTables.filter(
        (name) =>
          !legacyRequiredColumns[name] && !optionalLegacyTables.has(name),
      );
      const missingTables = expectedLegacyTables.filter(
        (name) => !applicationTables.includes(name),
      );
      if (unknownTables.length > 0 || missingTables.length > 0) {
        throw new Error(
          [
            "unsupported partially initialized Career database",
            unknownTables.length
              ? `unknown tables: ${unknownTables.join(", ")}`
              : "",
            missingTables.length
              ? `missing tables: ${missingTables.join(", ")}`
              : "",
          ].filter(Boolean).join("; "),
        );
      }
    }
    for (const [tableName, requiredColumns] of Object.entries(
      legacyRequiredColumns,
    )) {
      await validateLegacyTableIfPresent(
        queryRunner,
        tableName,
        requiredColumns,
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" varchar,
        "email" varchar,
        "username" varchar,
        "displayName" varchar,
        "passwordHash" varchar,
        "profileJson" text NOT NULL DEFAULT ('{}'),
        "refreshTokenHash" varchar,
        "refreshTokenExpiresAt" datetime,
        "tokenVersion" integer NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "artifacts" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "type" text,
        "title" text,
        "status" text,
        "renderMode" text,
        "summary" text,
        "payloadPath" text,
        "createdAt" datetime
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "cid" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "id" text NOT NULL,
        "userId" integer NOT NULL,
        "title" varchar,
        "preview" varchar,
        "status" varchar NOT NULL DEFAULT ('active'),
        "updatedAt" datetime NOT NULL,
        "createdAt" datetime NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "messageId" varchar,
        "conversationId" varchar NOT NULL,
        "resourceId" varchar,
        "resourceKind" varchar,
        "resourcePath" text,
        "mimeType" varchar,
        "title" varchar,
        "sizeBytes" integer,
        "createdAt" datetime NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "teams" (
        "id" varchar PRIMARY KEY NOT NULL,
        "userId" integer NOT NULL,
        "name" text NOT NULL,
        "description" text,
        "domain" text NOT NULL DEFAULT ('ecommerce-mvp'),
        "config" json,
        "status" text NOT NULL DEFAULT ('active'),
        "members" json,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "memories" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "content" text NOT NULL,
        "category" text,
        "tags" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "api_settings" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL UNIQUE,
        "provider" text NOT NULL DEFAULT ('anthropic'),
        "apiKey" text,
        "baseUrl" text,
        "model" text,
        "imageUrl" text,
        "imageKey" text,
        "imageDefaultModel" text,
        "imageModels" text,
        "videoUrl" text,
        "videoKey" text,
        "videoDefaultModel" text,
        "videoModels" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resources" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "conversationId" varchar NOT NULL,
        "messageId" varchar NOT NULL,
        "resourceId" varchar NOT NULL,
        "resourceKind" varchar NOT NULL,
        "resourcePath" text NOT NULL,
        "mimeType" varchar,
        "title" varchar,
        "sizeBytes" integer,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "generated_apps" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "conversationId" varchar,
        "messageId" varchar,
        "appName" varchar NOT NULL,
        "appPath" text,
        "summary" text,
        "status" varchar NOT NULL DEFAULT ('created'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await createUniqueIndexIfMissing(
      queryRunner,
      "users",
      "email",
      "IDX_97672ac88f789774dd47f7c8be",
    );
    await createUniqueIndexIfMissing(
      queryRunner,
      "users",
      "username",
      "IDX_fe0bb3f6520ee0469504521e71",
    );
    await createUniqueIndexIfMissing(
      queryRunner,
      "api_settings",
      "userId",
      "IDX_api_settings_userId_unique",
    );
  }

  async down(queryRunner: QueryRunner) {
    for (const tableName of [
      "generated_apps",
      "resources",
      "api_settings",
      "memories",
      "teams",
      "messages",
      "conversations",
      "artifacts",
      "users",
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${tableName}"`);
    }
  }
}
