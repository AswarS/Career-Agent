import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  careerAgentDatabasePath,
  careerAgentEntities,
} from './database.config.js';
import { ConversationModule } from './modules/conversation/conversation.module';
import { AgentModule } from './modules/agent/agent.module';
import { ArtifactModule } from './modules/artifact/artifact.module';
import { TeamModule } from './modules/team/team.module';
import { SkillModule } from './modules/skill/skill.module';
import { AuthModule } from './modules/auth/auth.module';
import { MemoryModule } from './modules/memory/memory.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UserModule } from './modules/user/user.module';
import { GeneratedModule } from './modules/generated/generated.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfileModule } from './modules/profile/profile.module';
import { PraxisIntegrationModule } from './modules/integration/praxis-integration.module';

const synchronizeSchema =
  process.env.CAREER_AGENT_SCHEMA_SYNC === 'true';

@Module({
  controllers: [AppController],
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: careerAgentDatabasePath,
      entities: careerAgentEntities,
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
    PraxisIntegrationModule,
    GeneratedModule,
  ],
  providers: [AppService],
})
export class AppModule {}
