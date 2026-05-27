import { Module, forwardRef } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillRegistry } from './skill.registry';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [SkillController],
  providers: [SkillService, SkillRegistry],
  exports: [SkillService, SkillRegistry],
})
export class SkillModule {}
