import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GatewayMonitorService } from './gateway-monitor.service.js';

@Controller('api/career-agent/gateway-monitor')
export class GatewayMonitorController {
  constructor(private readonly gatewayMonitorService: GatewayMonitorService) {}

  @Get('summary')
  summary(
    @Req() req: Request,
    @Query('range') range?: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.gatewayMonitorService.summary(req.userId!, {
      range,
      sessionId,
      limit: Number(limit),
    });
  }
}
