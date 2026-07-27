import {
  TableColumn,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
} from "typeorm";

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  column: TableColumn,
) {
  const table = await queryRunner.getTable(tableName);
  if (!table) {
    throw new Error(`${tableName} table is missing`);
  }
  if (!table.findColumnByName(column.name)) {
    await queryRunner.addColumn(tableName, column);
  }
}

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
) {
  const table = await queryRunner.getTable(tableName);
  if (!table) {
    throw new Error(`${tableName} table is missing`);
  }
  if (!table.indices.some(({ name }) => name === index.name)) {
    await queryRunner.createIndex(tableName, index);
  }
}

export class AlignCareerAgentSchema1785128059000 implements MigrationInterface {
  name = "AlignCareerAgentSchema1785128059000";

  async up(queryRunner: QueryRunner) {
    for (const column of [
      new TableColumn({
        name: "conversationId",
        type: "text",
        isNullable: true,
      }),
      new TableColumn({ name: "messageId", type: "text", isNullable: true }),
      new TableColumn({ name: "kind", type: "text", isNullable: true }),
      new TableColumn({ name: "url", type: "text", isNullable: true }),
      new TableColumn({ name: "storagePath", type: "text", isNullable: true }),
      new TableColumn({ name: "mimeType", type: "text", isNullable: true }),
      new TableColumn({ name: "sizeBytes", type: "integer", isNullable: true }),
      new TableColumn({ name: "metadataJson", type: "text", isNullable: true }),
    ]) {
      await addColumnIfMissing(queryRunner, "artifacts", column);
    }
    await addColumnIfMissing(
      queryRunner,
      "resources",
      new TableColumn({
        name: "artifactId",
        type: "varchar",
        isNullable: true,
      }),
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profile_suggestions" (
        "rowId" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "id" varchar NOT NULL,
        "userId" integer NOT NULL,
        "title" varchar NOT NULL,
        "rationale" text NOT NULL,
        "sourceThreadId" varchar,
        "patchJson" text NOT NULL,
        "status" varchar NOT NULL DEFAULT ('pending'),
        "resolvedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await addColumnIfMissing(
      queryRunner,
      "profile_suggestions",
      new TableColumn({
        name: "resolvedAt",
        type: "datetime",
        isNullable: true,
      }),
    );

    const indexes = [
      [
        "profile_suggestions",
        "IDX_profile_suggestions_user_status_created",
        ["userId", "status", "createdAt"],
      ],
      [
        "conversations",
        "IDX_conversations_user_updated",
        ["userId", "updatedAt"],
      ],
      [
        "messages",
        "IDX_messages_user_conversation_created",
        ["userId", "conversationId", "createdAt"],
      ],
      [
        "artifacts",
        "IDX_artifacts_user_conversation_created",
        ["userId", "conversationId", "createdAt"],
      ],
      [
        "resources",
        "IDX_resources_user_conversation_created",
        ["userId", "conversationId", "createdAt"],
      ],
      [
        "generated_apps",
        "IDX_generated_apps_user_conversation_created",
        ["userId", "conversationId", "createdAt"],
      ],
      ["memories", "IDX_memories_user_created", ["userId", "createdAt"]],
      ["teams", "IDX_teams_user_updated", ["userId", "updatedAt"]],
    ] as const;
    for (const [tableName, name, columnNames] of indexes) {
      await createIndexIfMissing(
        queryRunner,
        tableName,
        new TableIndex({ name, columnNames: [...columnNames] }),
      );
    }
  }

  async down(queryRunner: QueryRunner) {
    for (const [tableName, indexName] of [
      ["teams", "IDX_teams_user_updated"],
      ["memories", "IDX_memories_user_created"],
      ["generated_apps", "IDX_generated_apps_user_conversation_created"],
      ["resources", "IDX_resources_user_conversation_created"],
      ["artifacts", "IDX_artifacts_user_conversation_created"],
      ["messages", "IDX_messages_user_conversation_created"],
      ["conversations", "IDX_conversations_user_updated"],
    ]) {
      const table = await queryRunner.getTable(tableName);
      if (table?.indices.some(({ name }) => name === indexName)) {
        await queryRunner.dropIndex(tableName, indexName);
      }
    }
    await queryRunner.query('DROP TABLE IF EXISTS "profile_suggestions"');
    for (const [tableName, columnName] of [
      ["resources", "artifactId"],
      ["artifacts", "metadataJson"],
      ["artifacts", "sizeBytes"],
      ["artifacts", "mimeType"],
      ["artifacts", "storagePath"],
      ["artifacts", "url"],
      ["artifacts", "kind"],
      ["artifacts", "messageId"],
      ["artifacts", "conversationId"],
    ]) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName(columnName)) {
        await queryRunner.dropColumn(tableName, columnName);
      }
    }
  }
}
