import { Module, forwardRef } from '@nestjs/common';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';
import { SkillRegistry } from './skill.registry';
import { SettingsModule } from '../settings/settings.module';
import { AgentModule } from '../agent/agent.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [forwardRef(() => SettingsModule), AgentModule, ProfileModule],
  controllers: [SkillController],
  providers: [SkillService, SkillRegistry],
  exports: [SkillService, SkillRegistry],
})
export class SkillModule {}
