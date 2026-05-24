import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { AgentModule } from '../agent/agent.module';
import { SkillModule } from '../skill/skill.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationEntity, MessageEntity]),
    AgentModule,
    SkillModule,
    UserSettingsModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
