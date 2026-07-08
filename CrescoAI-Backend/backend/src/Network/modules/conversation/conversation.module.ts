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

@Module({
  imports: [TypeOrmModule.forFeature([ConversationEntity, MessageEntity, ResourceEntity]), AgentModule, SkillModule, AuthModule, ArtifactModule, ProfileModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
