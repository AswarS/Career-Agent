import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { TestApiSettingDto } from './dto/test-api-setting.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UpsertApiSettingDto } from './dto/upsert-api-setting.dto';
import { UserSettingsService } from './user-settings.service';

@Controller('api/career-agent/settings')
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get()
  getSettings(@Req() request: AuthenticatedRequest) {
    return this.userSettingsService.getSettings(request.user!.id);
  }

  @Patch('username')
  updateUsername(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUsernameDto,
  ) {
    return this.userSettingsService.updateUsername(request.user!.id, dto);
  }

  @Get('api')
  listApiSettings(@Req() request: AuthenticatedRequest) {
    return this.userSettingsService.listApiSettings(request.user!.id);
  }

  @Put('api')
  upsertApiSetting(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpsertApiSettingDto,
  ) {
    return this.userSettingsService.upsertApiSetting(request.user!.id, dto);
  }

  @Post('api')
  @HttpCode(HttpStatus.OK)
  createOrUpdateApiSetting(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpsertApiSettingDto,
  ) {
    return this.userSettingsService.upsertApiSetting(request.user!.id, dto);
  }

  @Post('api/test')
  @HttpCode(HttpStatus.OK)
  testApiSetting(
    @Req() request: AuthenticatedRequest,
    @Body() dto: TestApiSettingDto,
  ) {
    return this.userSettingsService.testApiSetting(request.user!.id, dto);
  }
}
