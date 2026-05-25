import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationEntity } from '../conversation/entities/conversation.entity';
import { AuthMiddleware } from './auth.middleware';
import { OwnershipGuard } from './ownership.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationEntity])],
  providers: [AuthMiddleware, OwnershipGuard],
  exports: [AuthMiddleware, OwnershipGuard],
})
export class AuthModule {}
