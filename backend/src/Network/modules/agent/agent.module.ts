import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
