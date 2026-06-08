import { Module } from '@nestjs/common';
import { GeneratedController } from './generated.controller.js';

@Module({
  controllers: [GeneratedController],
})
export class GeneratedModule {}
