import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { ResourceEntity } from '../resource/entities/resource.entity';
import { AgentModule } from '../agent/agent.module';
import { SkillModule } from '../skill/skill.module';
import { AuthModule } from '../auth/auth.module';
import { ArtifactModule } from '../artifact/artifact.module';
import { ProfileModule } from '../profile/profile.module';
import { UserEntity } from '../user/entities/user.entity';
import { ConversationTranscriptProjectionService } from './transcript-projection.service';
import { ConversationCleanupTaskEntity } from './entities/conversation-cleanup-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      MessageEntity,
      ResourceEntity,
      UserEntity,
      ConversationCleanupTaskEntity,
    ]),
    AgentModule,
    SkillModule,
    AuthModule,
    ArtifactModule,
    ProfileModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService, ConversationTranscriptProjectionService],
})
export class ConversationModule {}
