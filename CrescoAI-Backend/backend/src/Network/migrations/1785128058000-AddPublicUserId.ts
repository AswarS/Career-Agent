import {
  type MigrationInterface,
  type QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

const PUBLIC_USER_ID_COLUMN = 'publicUserId';
const PUBLIC_USER_ID_INDEX = 'IDX_users_publicUserId_unique';
const PUBLIC_USER_ID_IMMUTABLE_TRIGGER = 'TRG_users_publicUserId_immutable';

export class AddPublicUserId1785128058000 implements MigrationInterface {
  name = 'AddPublicUserId1785128058000';

  async up(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('users'))) {
      throw new Error(
        'users table is missing; initialize the baseline schema before running migrations',
      );
    }

    let usersTable = await queryRunner.getTable('users');
    if (!usersTable) {
      return;
    }

    if (!usersTable.findColumnByName(PUBLIC_USER_ID_COLUMN)) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: PUBLIC_USER_ID_COLUMN,
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
    }

    // MigrationExecutor wraps all migrations in one transaction. SQLite
    // evaluates randomblob() per row, so this is a single atomic backfill.
    await queryRunner.query(`
      UPDATE "users"
      SET "${PUBLIC_USER_ID_COLUMN}" =
        lower(hex(randomblob(4))) || '-' ||
        lower(hex(randomblob(2))) || '-4' ||
        substr(lower(hex(randomblob(2))), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) ||
        substr(lower(hex(randomblob(2))), 2) || '-' ||
        lower(hex(randomblob(6)))
      WHERE "${PUBLIC_USER_ID_COLUMN}" IS NULL
         OR trim("${PUBLIC_USER_ID_COLUMN}") = ''
    `);

    const [{ missing }] = await queryRunner.query(`
      SELECT count(*) AS missing
      FROM "users"
      WHERE "${PUBLIC_USER_ID_COLUMN}" IS NULL
         OR trim("${PUBLIC_USER_ID_COLUMN}") = ''
    `);
    if (Number(missing) !== 0) {
      throw new Error('publicUserId backfill did not populate every user');
    }

    usersTable = await queryRunner.getTable('users');
    const currentColumn = usersTable?.findColumnByName(PUBLIC_USER_ID_COLUMN);
    if (!currentColumn) {
      throw new Error('publicUserId column is missing after backfill');
    }
    if (currentColumn.isNullable) {
      const requiredColumn = currentColumn.clone();
      requiredColumn.isNullable = false;
      await queryRunner.changeColumn(
        'users',
        currentColumn,
        requiredColumn,
      );
    }

    usersTable = await queryRunner.getTable('users');
    if (!usersTable?.indices.some((index) => index.name === PUBLIC_USER_ID_INDEX)) {
      await queryRunner.createIndex(
        'users',
        new TableIndex({
          name: PUBLIC_USER_ID_INDEX,
          columnNames: [PUBLIC_USER_ID_COLUMN],
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "${PUBLIC_USER_ID_IMMUTABLE_TRIGGER}"
      BEFORE UPDATE OF "${PUBLIC_USER_ID_COLUMN}" ON "users"
      FOR EACH ROW
      WHEN OLD."${PUBLIC_USER_ID_COLUMN}" <> NEW."${PUBLIC_USER_ID_COLUMN}"
      BEGIN
        SELECT RAISE(ABORT, 'publicUserId is immutable');
      END
    `);
  }

  async down(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasTable('users'))) {
      return;
    }

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "${PUBLIC_USER_ID_IMMUTABLE_TRIGGER}"`,
    );
    const usersTable = await queryRunner.getTable('users');
    if (usersTable?.indices.some((index) => index.name === PUBLIC_USER_ID_INDEX)) {
      await queryRunner.dropIndex('users', PUBLIC_USER_ID_INDEX);
    }
    if (usersTable?.findColumnByName(PUBLIC_USER_ID_COLUMN)) {
      await queryRunner.dropColumn('users', PUBLIC_USER_ID_COLUMN);
    }
  }
}
