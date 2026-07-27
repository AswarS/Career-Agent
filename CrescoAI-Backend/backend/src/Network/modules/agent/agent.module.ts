import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SettingsModule } from '../settings/settings.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [SettingsModule, ProfileModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
