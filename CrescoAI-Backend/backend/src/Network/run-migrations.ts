import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { careerAgentDatabasePath } from './database.config.js';
import { ProfileV2Foundation1760000000000 } from './migrations/1760000000000-ProfileV2Foundation.js';
import { ProfileMemory1760000001000 } from './migrations/1760000001000-ProfileMemory.js';
import { ProfileProposals1760000002000 } from './migrations/1760000002000-ProfileProposals.js';
import { ProfileLevelClassification1760000003000 } from './migrations/1760000003000-ProfileLevelClassification.js';
import { ProfileIndexedMemory1760000004000 } from './migrations/1760000004000-ProfileIndexedMemory.js';
import { ConversationCleanupTasks1760000005000 } from './migrations/1760000005000-ConversationCleanupTasks.js';
import { CreateCareerAgentBaseline1785000000000 } from './migrations/1785000000000-CreateCareerAgentBaseline.js';
import { AddPublicUserId1785128058000 } from './migrations/1785128058000-AddPublicUserId.js';
import { AlignCareerAgentSchema1785128059000 } from './migrations/1785128059000-AlignCareerAgentSchema.js';
import { AddIntegrationKernel1785128060000 } from './migrations/1785128060000-AddIntegrationKernel.js';

await mkdir(dirname(careerAgentDatabasePath), { recursive: true });

const dataSource = new DataSource({
  type: 'sqlite',
  database: careerAgentDatabasePath,
  migrations: [
    ProfileV2Foundation1760000000000,
    ProfileMemory1760000001000,
    ProfileProposals1760000002000,
    ProfileLevelClassification1760000003000,
    ProfileIndexedMemory1760000004000,
    ConversationCleanupTasks1760000005000,
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
