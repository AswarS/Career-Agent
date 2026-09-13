import { Module } from '@nestjs/common';
import { GatewayMonitorController } from './gateway-monitor.controller.js';
import { GatewayMonitorService } from './gateway-monitor.service.js';

@Module({
  controllers: [GatewayMonitorController],
  providers: [GatewayMonitorService],
})
export class GatewayMonitorModule {}
