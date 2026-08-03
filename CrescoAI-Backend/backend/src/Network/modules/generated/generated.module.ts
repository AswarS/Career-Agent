import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneratedController } from './generated.controller.js';
import { UserEntity } from '../user/entities/user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [GeneratedController],
})
export class GeneratedModule {}
