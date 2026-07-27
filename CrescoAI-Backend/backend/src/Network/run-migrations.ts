import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { careerAgentDatabasePath } from './database.config.js';
import { CreateCareerAgentBaseline1785000000000 } from './migrations/1785000000000-CreateCareerAgentBaseline.js';
import { AddPublicUserId1785128058000 } from './migrations/1785128058000-AddPublicUserId.js';
import { AlignCareerAgentSchema1785128059000 } from './migrations/1785128059000-AlignCareerAgentSchema.js';
import { AddIntegrationKernel1785128060000 } from './migrations/1785128060000-AddIntegrationKernel.js';

await mkdir(dirname(careerAgentDatabasePath), { recursive: true });

const dataSource = new DataSource({
  type: 'sqlite',
  database: careerAgentDatabasePath,
  migrations: [
    CreateCareerAgentBaseline1785000000000,
    AddPublicUserId1785128058000,
    AlignCareerAgentSchema1785128059000,
    AddIntegrationKernel1785128060000,
  ],
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
