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
import { AppController } from './app.controller';
import { AppService } from './app.service';

const networkDir = dirname(fileURLToPath(import.meta.url));

@Module({
  controllers: [AppController],
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: join(networkDir, 'data', 'test.sqlite'),
      entities: [UserEntity, ArtifactEntity, ConversationEntity, MessageEntity, TeamEntity],
      synchronize: true,
    }),
    AgentModule,
    ConversationModule,
    ArtifactModule,
    TeamModule,
    SkillModule,
  ],
  providers: [AppService],
})
export class AppModule {}
