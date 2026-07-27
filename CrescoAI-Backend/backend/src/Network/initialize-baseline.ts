import { DataSource } from 'typeorm';
import { careerAgentEntities } from './database.config.js';

const infrastructureTables = new Set(['migrations', 'typeorm_metadata']);

/**
 * Initializes the complete current schema only when the database contains no
 * application tables. Normal application startup never calls this function.
 */
export async function initializeCareerAgentBaselineIfEmpty(database: string) {
  const inspector = new DataSource({
    type: 'sqlite',
    database,
    synchronize: false,
  });
  await inspector.initialize();
  const queryRunner = inspector.createQueryRunner();

  try {
    if (await queryRunner.hasTable('users')) {
      return false;
    }

    const tables = await queryRunner.query(`
      SELECT "name"
      FROM "sqlite_master"
      WHERE "type" = 'table'
        AND "name" NOT LIKE 'sqlite_%'
    `) as Array<{ name: string }>;
    const applicationTables = tables
      .map(({ name }) => name)
      .filter((name) => !infrastructureTables.has(name));

    if (applicationTables.length > 0) {
      throw new Error(
        `database is partially initialized without users table: ${applicationTables.join(', ')}`,
      );
    }
  } finally {
    await queryRunner.release();
    await inspector.destroy();
  }

  const baseline = new DataSource({
    type: 'sqlite',
    database,
    entities: careerAgentEntities,
    synchronize: true,
  });
  try {
    await baseline.initialize();
  } finally {
    if (baseline.isInitialized) {
      await baseline.destroy();
    }
  }
  return true;
}
