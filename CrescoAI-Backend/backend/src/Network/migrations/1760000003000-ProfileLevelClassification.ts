import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

export class ProfileLevelClassification1760000003000 implements MigrationInterface {
  name = 'ProfileLevelClassification1760000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('profile_memory_items', 'confidence')) {
      await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_memory_confidence_rollback" (
        "memoryId" varchar PRIMARY KEY NOT NULL,
        "confidence" float NOT NULL
      )`);
      await queryRunner.query(`INSERT OR REPLACE INTO "profile_memory_confidence_rollback" ("memoryId", "confidence")
        SELECT "id", "confidence" FROM "profile_memory_items"`);
      await queryRunner.dropColumn('profile_memory_items', 'confidence');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasRollbackData = await queryRunner.hasTable('profile_memory_confidence_rollback');
    if (!(await queryRunner.hasColumn('profile_memory_items', 'confidence'))) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'confidence',
        type: 'float',
        isNullable: false,
        default: 1,
      }));
      if (hasRollbackData) {
        await queryRunner.query(`UPDATE "profile_memory_items"
          SET "confidence" = COALESCE((
            SELECT "legacy"."confidence"
            FROM "profile_memory_confidence_rollback" "legacy"
            WHERE "legacy"."memoryId" = "profile_memory_items"."id"
          ), 1)`);
      }
    }
    if (hasRollbackData) {
      await queryRunner.query('DROP TABLE "profile_memory_confidence_rollback"');
    }
  }
}
