import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ProfileService, type ProfileRecord } from './profile.service';

@Controller('api/career-agent/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('suggestions')
  getSuggestions(@Req() request: AuthenticatedRequest) {
    return this.profileService.getSuggestions(Number(request.user!.id));
  }

  @Get()
  getProfile(@Req() request: AuthenticatedRequest) {
    return this.profileService.getProfile(Number(request.user!.id));
  }

  @Put()
  updateProfile(
    @Body() profile: ProfileRecord,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profileService.updateProfile(Number(request.user!.id), profile);
  }
}
