import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationModule } from './modules/conversation/conversation.module';
import { ConversationEntity } from './modules/conversation/entities/conversation.entity';
import { MessageEntity } from './modules/conversation/entities/message.entity';
import { AgentModule } from './modules/agent/agent.module';
import { UserEntity } from './modules/user/entities/user.entity';
import { ArtifactEntity } from './modules/artifact/entities/artifact.entity';
import { ArtifactModule } from './modules/artifact/artifact.module';
import { TeamModule } from './modules/team/team.module';
import { TeamEntity } from './modules/team/entities/team.entity';
import { SkillModule } from './modules/skill/skill.module';
import { AuthModule } from './modules/auth/auth.module';
import { MemoryModule } from './modules/memory/memory.module';
import { MemoryEntity } from './modules/memory/entities/memory.entity';
import { SettingsModule } from './modules/settings/settings.module';
import { ApiSettingsEntity } from './modules/settings/entities/api-settings.entity';
import { UserModule } from './modules/user/user.module';
import { ResourceEntity } from './modules/resource/entities/resource.entity';
import { GeneratedAppEntity } from './modules/generated-app/entities/generated-app.entity';
import { GeneratedModule } from './modules/generated/generated.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfileModule } from './modules/profile/profile.module';
import { ProfileSuggestionEntity } from './modules/profile/entities/profile-suggestion.entity';
import { BaseProfileEntity } from './modules/profile/entities/base-profile.entity';
import { ProfileStateEntity } from './modules/profile/entities/profile-state.entity';
import { ProfileRevisionEntity } from './modules/profile/entities/profile-revision.entity';
import { ProfileMemoryItemEntity } from './modules/profile/entities/profile-memory-item.entity';
import { ProfileProjectionJobEntity } from './modules/profile/entities/profile-projection-job.entity';
import { ProfileChangeProposalEntity } from './modules/profile/entities/profile-change-proposal.entity';
import { ProfileV2Foundation1760000000000 } from './migrations/1760000000000-ProfileV2Foundation';
import { ProfileMemory1760000001000 } from './migrations/1760000001000-ProfileMemory';
import { ProfileProposals1760000002000 } from './migrations/1760000002000-ProfileProposals';
import { ProfileLevelClassification1760000003000 } from './migrations/1760000003000-ProfileLevelClassification';

const networkDir = dirname(fileURLToPath(import.meta.url));

@Module({
  controllers: [AppController],
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(networkDir, 'data', 'test.sqlite'),
      entities: [
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
        BaseProfileEntity,
        ProfileStateEntity,
        ProfileRevisionEntity,
        ProfileMemoryItemEntity,
        ProfileProjectionJobEntity,
        ProfileChangeProposalEntity,
      ],
      synchronize:
        process.env.NODE_ENV !== 'production'
        && process.env.CAREER_AGENT_DB_SYNCHRONIZE !== 'false',
      migrations: [
        ProfileV2Foundation1760000000000,
        ProfileMemory1760000001000,
        ProfileProposals1760000002000,
        ProfileLevelClassification1760000003000,
      ],
      migrationsRun:
        process.env.NODE_ENV === 'production'
        || process.env.CAREER_AGENT_DB_MIGRATIONS_RUN === 'true',
    }),
    AgentModule,
    ConversationModule,
    ArtifactModule,
    TeamModule,
    SkillModule,
    AuthModule,
    MemoryModule,
    SettingsModule,
    UserModule,
    ProfileModule,
    GeneratedModule,
  ],
  providers: [AppService],
})
export class AppModule {}
