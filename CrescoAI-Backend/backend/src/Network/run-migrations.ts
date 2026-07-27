import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { careerAgentDatabasePath } from './database.config.js';
import { initializeCareerAgentBaselineIfEmpty } from './initialize-baseline.js';
import { AddPublicUserId1785128058000 } from './migrations/1785128058000-AddPublicUserId.js';

await mkdir(dirname(careerAgentDatabasePath), { recursive: true });
const initializedBaseline =
  await initializeCareerAgentBaselineIfEmpty(careerAgentDatabasePath);
if (initializedBaseline) {
  console.log('Initialized the Career Agent baseline schema.');
}

const dataSource = new DataSource({
  type: 'sqlite',
  database: careerAgentDatabasePath,
  migrations: [AddPublicUserId1785128058000],
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
