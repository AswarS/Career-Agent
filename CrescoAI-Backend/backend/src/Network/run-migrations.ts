import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { careerAgentDatabasePath } from './database.config.js';
import { careerAgentMigrations } from './migrations/migration-list.js';

await mkdir(dirname(careerAgentDatabasePath), { recursive: true });

const dataSource = new DataSource({
  type: 'sqlite',
  database: careerAgentDatabasePath,
  migrations: careerAgentMigrations,
  migrationsTransactionMode: 'all',
  synchronize: false,
});

try {
  await dataSource.initialize();
  const applied = await dataSource.runMigrations({ transaction: 'all' });
  console.log(`Applied ${applied.length} Career Agent migration(s).`);
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
