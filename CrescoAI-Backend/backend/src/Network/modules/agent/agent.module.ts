import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { SettingsModule } from '../settings/settings.module';
import { ProfileModule } from '../profile/profile.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileRefreshJobEntity } from '../profile/entities/profile-refresh-job.entity';
import { ProfileRefreshController } from './profile-refresh.controller';
import { ProfileRefreshService } from './profile-refresh.service';
import { GeneratedAppModule } from '../generated-app/generated-app.module';
import { PraxisIntegrationModule } from '../integration/praxis-integration.module.js';

@Module({
  imports: [
    SettingsModule,
    ProfileModule,
    GeneratedAppModule,
    PraxisIntegrationModule,
    TypeOrmModule.forFeature([ProfileRefreshJobEntity]),
  ],
  controllers: [ProfileRefreshController],
  providers: [AgentService, ProfileRefreshService],
  exports: [AgentService],
})
export class AgentModule {}
