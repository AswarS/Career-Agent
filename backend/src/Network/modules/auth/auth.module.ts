import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
