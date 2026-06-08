import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserEntity } from './entities/user.entity';
import { ConversationEntity } from '../conversation/entities/conversation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ConversationEntity])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

