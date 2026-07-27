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

const networkDir = dirname(fileURLToPath(import.meta.url));
const synchronizeSchema =
  process.env.CAREER_AGENT_SCHEMA_SYNC === 'true'
  || process.env.NODE_ENV !== 'production';

@Module({
  controllers: [AppController],
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.CAREER_AGENT_DATABASE_PATH ?? join(networkDir, 'data', 'test.sqlite'),
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
      ],
      // Production schema changes are applied explicitly with
      // `bun run network:migrate`, before any application instances start.
      synchronize: synchronizeSchema,
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
