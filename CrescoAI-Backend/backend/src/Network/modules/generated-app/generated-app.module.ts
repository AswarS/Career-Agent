import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactEntity } from '../artifact/entities/artifact.entity.js';
import { UserEntity } from '../user/entities/user.entity.js';
import { GeneratedAppEventEntity } from './entities/generated-app-event.entity.js';
import { GeneratedAppEntity } from './entities/generated-app.entity.js';
import { GeneratedAppEventsService } from './generated-app-events.service.js';
import { GeneratedAppService } from './generated-app.service.js';
import { AppInteractionSummaryService } from './app-interaction-summary.service.js';
import { AppInteractionQueryService } from './app-interaction-query.service.js';

/**
 * Lifecycle registry for generated Web Apps. Deliberately does not import
 * ConversationModule or AgentModule — both import this module, so importing
 * either here would create a dependency cycle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      GeneratedAppEntity,
      GeneratedAppEventEntity,
      ArtifactEntity,
      UserEntity,
    ]),
  ],
  providers: [
    GeneratedAppService,
    GeneratedAppEventsService,
    AppInteractionSummaryService,
    AppInteractionQueryService,
  ],
  exports: [
    GeneratedAppService,
    GeneratedAppEventsService,
    AppInteractionSummaryService,
    AppInteractionQueryService,
  ],
})
export class GeneratedAppModule {}
