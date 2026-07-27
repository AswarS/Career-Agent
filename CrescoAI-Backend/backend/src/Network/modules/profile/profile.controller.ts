import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
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
  listSuggestions(@Req() req: Request) {
    return this.profileService.listSuggestions(req.userId!);
  }

  @Post('suggestions/:rowId/reject')
  rejectSuggestion(
    @Req() req: Request,
    @Param('rowId', ParseIntPipe) rowId: number,
  ) {
    return this.profileService.rejectSuggestion(req.userId!, rowId);
  }
}
