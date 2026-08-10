import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileModule } from '../profile/profile.module';
import { UserEntity } from '../user/entities/user.entity';
import { IntegrationOutboxEntity } from './entities/integration-outbox.entity';
import {
  PraxisIntegrationController,
  PraxisJwksController,
  PraxisSsoController,
} from './praxis-integration.controller';
import { PraxisIntegrationService } from './praxis-integration.service';
import { PraxisServiceAuthGuard } from './praxis-service-auth.guard';
import { PraxisSsoService } from './praxis-sso.service';
import { PraxisOutboxPublisherService } from './praxis-outbox-publisher.service';
import { PraxisBehaviorEventEntity } from './entities/praxis-behavior-event.entity';
import { PraxisBehaviorEventService } from './praxis-behavior-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      IntegrationOutboxEntity,
      PraxisBehaviorEventEntity,
    ]),
    ProfileModule,
  ],
  controllers: [
    PraxisIntegrationController,
    PraxisJwksController,
    PraxisSsoController,
  ],
  providers: [
    PraxisIntegrationService,
    PraxisServiceAuthGuard,
    PraxisSsoService,
    PraxisOutboxPublisherService,
    PraxisBehaviorEventService,
  ],
  exports: [PraxisIntegrationService, PraxisSsoService],
})
export class PraxisIntegrationModule {}
