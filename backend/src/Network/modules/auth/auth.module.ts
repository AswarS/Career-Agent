import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { ConversationEntity } from '../conversation/entities/conversation.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OwnershipGuard } from './ownership.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, ConversationEntity])],
  controllers: [AuthController],
  providers: [
    AuthService,
    OwnershipGuard,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService, OwnershipGuard],
})
export class AuthModule {}
