import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArtifactEntity } from './modules/artifact/entities/artifact.entity.js';
import { ConversationEntity } from './modules/conversation/entities/conversation.entity.js';
import { MessageEntity } from './modules/conversation/entities/message.entity.js';
import { GeneratedAppEntity } from './modules/generated-app/entities/generated-app.entity.js';
import { MemoryEntity } from './modules/memory/entities/memory.entity.js';
import { IntegrationOutboxEntity } from './modules/integration/entities/integration-outbox.entity.js';
import { CareerProfileVersionEntity } from './modules/profile/entities/career-profile-version.entity.js';
import { ProfileSuggestionEntity } from './modules/profile/entities/profile-suggestion.entity.js';
import { ResourceEntity } from './modules/resource/entities/resource.entity.js';
import { ApiSettingsEntity } from './modules/settings/entities/api-settings.entity.js';
import { TeamEntity } from './modules/team/entities/team.entity.js';
import { UserEntity } from './modules/user/entities/user.entity.js';

const networkDir = dirname(fileURLToPath(import.meta.url));

export const careerAgentDatabasePath =
  process.env.CAREER_AGENT_DATABASE_PATH
  ?? join(networkDir, 'data', 'test.sqlite');

export const careerAgentEntities = [
  UserEntity,
  ArtifactEntity,
  ConversationEntity,
  MessageEntity,
  TeamEntity,
  MemoryEntity,
  ApiSettingsEntity,
  ResourceEntity,
  GeneratedAppEntity,
  ProfileSuggestionEntity,
  CareerProfileVersionEntity,
  IntegrationOutboxEntity,
];
