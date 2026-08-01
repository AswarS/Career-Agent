import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

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

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  column: TableColumn,
) {
  const table = await queryRunner.getTable(tableName);
  if (table && !table.findColumnByName(column.name)) {
    await queryRunner.addColumn(tableName, column);
  }
}

export class AddPraxisIntegrationDelivery1785128062000
implements MigrationInterface {
  name = 'AddPraxisIntegrationDelivery1785128062000';

  async up(queryRunner: QueryRunner) {
    await addColumnIfMissing(
      queryRunner,
      'users',
      new TableColumn({ name: 'avatarUrl', type: 'varchar', isNullable: true }),
    );
    await addColumnIfMissing(
      queryRunner,
      'integration_outbox',
      new TableColumn({ name: 'lockToken', type: 'varchar', isNullable: true }),
    );
    await addColumnIfMissing(
      queryRunner,
      'integration_outbox',
      new TableColumn({ name: 'lockedAt', type: 'datetime', isNullable: true }),
    );
    await addColumnIfMissing(
      queryRunner,
      'integration_outbox',
      new TableColumn({ name: 'lastError', type: 'text', isNullable: true }),
    );
    // TypeORM rebuilds SQLite tables for ADD COLUMN and does not preserve
    // custom triggers attached to the rebuilt users table.
    await recreatePublicUserIdTrigger(queryRunner);
  }

  async down(queryRunner: QueryRunner) {
    for (const [tableName, columnName] of [
      ['integration_outbox', 'lastError'],
      ['integration_outbox', 'lockedAt'],
      ['integration_outbox', 'lockToken'],
      ['users', 'avatarUrl'],
    ]) {
      const table = await queryRunner.getTable(tableName);
      if (table?.findColumnByName(columnName)) {
        await queryRunner.dropColumn(tableName, columnName);
      }
    }
    await recreatePublicUserIdTrigger(queryRunner);
  }
}
