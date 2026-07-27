import {
  TableColumn,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';

const PUBLIC_USER_ID_IMMUTABLE_TRIGGER =
  'TRG_users_publicUserId_immutable';

async function recreatePublicUserIdTrigger(queryRunner: QueryRunner) {
  await queryRunner.query(
    `DROP TRIGGER IF EXISTS "${PUBLIC_USER_ID_IMMUTABLE_TRIGGER}"`,
  );
  await queryRunner.query(`
    CREATE TRIGGER "${PUBLIC_USER_ID_IMMUTABLE_TRIGGER}"
    BEFORE UPDATE OF "publicUserId" ON "users"
    FOR EACH ROW
    WHEN OLD."publicUserId" <> NEW."publicUserId"
    BEGIN
      SELECT RAISE(ABORT, 'publicUserId is immutable');
    END
  `);
}

/**
 * Profile V2 is the sole profile source of truth. The former version table
 * and users-table pointer duplicated that state and could expose conflicting
 * external versions.
 */
export class ConsolidateProfileV2Snapshot1785128061000
implements MigrationInterface {
  name = 'ConsolidateProfileV2Snapshot1785128061000';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS "career_profile_versions"');
    for (const columnName of [
      'currentProfileVersionId',
      'profileVersion',
    ]) {
      const users = await queryRunner.getTable('users');
      if (users?.findColumnByName(columnName)) {
        await queryRunner.dropColumn('users', columnName);
      }
    }
    await recreatePublicUserIdTrigger(queryRunner);
  }

  async down(queryRunner: QueryRunner) {
    const users = await queryRunner.getTable('users');
    if (!users?.findColumnByName('profileVersion')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'profileVersion',
          type: 'integer',
          default: 0,
        }),
      );
    }
    const usersWithVersion = await queryRunner.getTable('users');
    if (!usersWithVersion?.findColumnByName('currentProfileVersionId')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'currentProfileVersionId',
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
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
        CONSTRAINT "FK_7aa4d0a42c32b7b1d70f5f6561f"
          FOREIGN KEY ("userId") REFERENCES "users" ("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        "IDX_career_profile_versions_user_version_unique"
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
    await recreatePublicUserIdTrigger(queryRunner);
  }
}
