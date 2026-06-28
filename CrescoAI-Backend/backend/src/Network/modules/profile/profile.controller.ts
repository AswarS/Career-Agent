import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@Controller('api/career-agent/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@Req() req: Request) {
    return this.profileService.getProfile(req.userId!);
  }

  @Put()
  updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(req.userId!, dto);
  }

  @Get('suggestions')
  listSuggestions() {
    return this.profileService.listSuggestions();
  }
}
