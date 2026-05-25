import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SettingsService } from './settings.service';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';

@Controller('api/career-agent/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@Req() req: Request) {
    return this.settingsService.getSettings(req.userId!);
  }

  @Put()
  update(@Req() req: Request, @Body() dto: UpdateApiSettingsDto) {
    return this.settingsService.upsertSettings(req.userId!, dto);
  }
}
