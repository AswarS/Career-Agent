import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { AddPublicUserId1785128058000 } from './migrations/1785128058000-AddPublicUserId.js';

const networkDir = dirname(fileURLToPath(import.meta.url));
const database =
  process.env.CAREER_AGENT_DATABASE_PATH
  ?? join(networkDir, 'data', 'test.sqlite');

await mkdir(dirname(database), { recursive: true });

const dataSource = new DataSource({
  type: 'sqlite',
  database,
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
