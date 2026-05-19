import { Module } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillRegistry } from './skill.registry';

@Module({
  controllers: [SkillController],
  providers: [SkillService, SkillRegistry],
  exports: [SkillService, SkillRegistry],
})
export class SkillModule {}
