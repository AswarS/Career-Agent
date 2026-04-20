import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationModule } from './modules/conversation/conversation.module';
import { ConversationEntity } from './modules/conversation/entities/conversation.entity';
import { MessageEntity } from './modules/conversation/entities/message.entity';
import { AgentModule } from './modules/agent/agent.module';
import { UserEntity } from './modules/user/entities/user.entity';
import { ArtifactEntity } from './modules/artifact/entities/artifact.entity';
import { ArtifactModule } from './modules/artifact/artifact.module';
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'data/app.sqlite',
      entities: [UserEntity, ArtifactEntity, ConversationEntity, MessageEntity],
      synchronize: true,
    }),
    AgentModule,
    ConversationModule,
    ArtifactModule,
  ],
})
export class AppModule {}
