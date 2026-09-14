import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneratedController } from './generated.controller.js';
import { UserEntity } from '../user/entities/user.entity.js';
import { GeneratedAppModule } from '../generated-app/generated-app.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), GeneratedAppModule],
  controllers: [GeneratedController],
})
export class GeneratedModule {}
