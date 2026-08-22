import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PraxisIntegrationService } from './praxis-integration.service';
import { PraxisServiceAuthGuard } from './praxis-service-auth.guard';
import {
  PraxisIntegrationExceptionFilter,
  PraxisTraceInterceptor,
} from './praxis-integration-http';
import { PraxisSsoService } from './praxis-sso.service';
import { PraxisBehaviorEventService } from './praxis-behavior-event.service';

type PraxisIntegrationRequest = AuthenticatedRequest & {
  praxisTraceId?: string;
};

@Controller('integration/praxis/v1')
@Public()
@UseGuards(PraxisServiceAuthGuard)
@UseInterceptors(PraxisTraceInterceptor)
@UseFilters(PraxisIntegrationExceptionFilter)
export class PraxisIntegrationController {
  constructor(
    private readonly integration: PraxisIntegrationService,
    private readonly behaviorEvents: PraxisBehaviorEventService,
  ) {}

  @Get('accounts/:externalUserId')
  getAccount(@Param('externalUserId') externalUserId: string) {
    return this.integration.getAccount(externalUserId);
  }

  @Get('profiles/:externalUserId')
  getProfile(@Param('externalUserId') externalUserId: string) {
    return this.integration.getProfile(externalUserId);
  }

  @Get('directory/users')
  searchDirectory(
    @Query('query') query: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.integration.searchDirectory(query, cursor, limit);
  }

  @Post('behavior-events')
  @HttpCode(HttpStatus.ACCEPTED)
  receiveBehaviorEvent(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: PraxisIntegrationRequest,
  ) {
    return this.behaviorEvents.receive(
      body,
      idempotencyKey,
      request.praxisTraceId,
    );
  }
}

@Controller('integration/praxis/v1')
export class PraxisJwksController {
  constructor(private readonly sso: PraxisSsoService) {}

  @Public()
  @Get('.well-known/jwks.json')
  jwks() {
    return this.sso.jwks();
  }
}

@Controller('api/career-agent/integrations/praxis')
export class PraxisSsoController {
  constructor(private readonly sso: PraxisSsoService) {}

  @Post('sso-ticket')
  issueTicket(@Req() request: AuthenticatedRequest) {
    return this.sso.issueTicket(request.userId!);
  }
}
