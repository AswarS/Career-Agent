import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';
import { ProfileV2Service } from './profile-v2.service';
import { UpdateBaseProfileDto } from './dto/base-profile.dto';
import { ProfileMemoryService } from './profile-memory.service';
import {
  CreateProfileMemoryDto,
  QueryProfileMemoryDto,
  ReplaceProfileMemoryDto,
  UpdateProfileMemoryDto,
} from './dto/profile-memory.dto';
import { ProfileProposalService } from './profile-proposal.service';
import { ProposeBaseProfileDto, ProposeProfileMemoryDto } from './dto/profile-proposal.dto';
import { ProfileMaintenanceService } from './profile-maintenance.service';
import { profileAccessDenied, profileValidationError } from './profile.errors';
import { profileFeatureFlags } from './profile-feature-flags';

@Controller('api/career-agent/profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly profileV2Service: ProfileV2Service,
    private readonly profileMemoryService: ProfileMemoryService,
    private readonly profileProposalService: ProfileProposalService,
    private readonly profileMaintenanceService: ProfileMaintenanceService,
  ) {}

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

  @Get('base')
  getBaseProfile(@Req() req: Request) {
    this.assertV2Read();
    return this.profileV2Service.getBaseProfile(req.userId!);
  }

  @Patch('base')
  updateBaseProfile(
    @Req() req: Request,
    @Body() dto: UpdateBaseProfileDto,
  ) {
    return this.profileV2Service.updateBaseProfile(req.userId!, dto, {
      sourceType: 'user_ui',
      expectedVersion: dto.expectedVersion,
      userConfirmed: true,
      updateLevel: 'L3',
      actorType: 'user',
    });
  }

  @Get('state')
  async getProfileState(@Req() req: Request) {
    this.assertV2Read();
    const state = await this.profileV2Service.getState(req.userId!);
    return {
      aggregateVersion: state.aggregateVersion,
      projectionVersion: state.projectionVersion,
      projectionStatus: state.projectionStatus,
    };
  }

  @Get('memories')
  listMemories(@Req() req: Request, @Query() query: QueryProfileMemoryDto) {
    this.assertV2Read();
    return this.profileMemoryService.list(req.userId!, query);
  }

  @Post('memories')
  createMemory(@Req() req: Request, @Body() dto: CreateProfileMemoryDto) {
    return this.profileMemoryService.create(req.userId!, dto, {
      sourceType: 'user_ui',
      actorType: 'user',
      userConfirmed: true,
      updateLevel: dto.profileLevel ?? (dto.priority === 'hard_constraint' ? 'L3' : dto.timeScope === 'short_term' ? 'L1' : 'L2'),
    });
  }

  @Patch('memories/:id')
  updateMemory(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateProfileMemoryDto,
  ) {
    return this.profileMemoryService.update(req.userId!, id, dto, {
      sourceType: 'user_ui',
      actorType: 'user',
      userConfirmed: true,
      updateLevel: 'L3',
    });
  }

  @Put('memories/by-index/:profileIndex')
  replaceMemory(
    @Req() req: Request,
    @Param('profileIndex') profileIndex: string,
    @Body() dto: ReplaceProfileMemoryDto,
  ) {
    return this.profileMemoryService.replaceByIndex(req.userId!, profileIndex, dto, {
      sourceType: 'user_confirmed',
      actorType: 'user',
      userConfirmed: true,
      expectedVersion: dto.expectedVersion,
      updateLevel: 'L3',
    });
  }

  @Delete('memories/:id')
  async deleteMemory(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('expectedVersion') expectedVersion: string,
  ) {
    const version = Number(expectedVersion);
    if (!Number.isInteger(version) || version < 1) {
      throw profileValidationError('expectedVersion must be a positive integer');
    }
    await this.profileMemoryService.softDelete(req.userId!, id, version);
    return { deleted: true };
  }

  @Get('history')
  history(@Req() req: Request, @Query('limit') limit?: string) {
    this.assertV2Read();
    return this.profileMemoryService.history(req.userId!, Number(limit) || 100);
  }

  @Get('proposals')
  listProposals(
    @Req() req: Request,
    @Query('status') status?: 'pending' | 'applied' | 'rejected' | 'expired',
  ) {
    this.assertV2Read();
    return this.profileProposalService.list(req.userId!, status ?? 'pending');
  }

  @Post('proposals/memory')
  proposeMemory(@Req() req: Request, @Body() dto: ProposeProfileMemoryDto) {
    return this.profileProposalService.proposeMemory(req.userId!, dto);
  }

  @Post('proposals/base')
  proposeBase(@Req() req: Request, @Body() dto: ProposeBaseProfileDto) {
    return this.profileProposalService.proposeBase(req.userId!, dto);
  }

  @Post('proposals/:id/accept')
  async acceptProposal(@Req() req: Request, @Param('id') id: string) {
    const result = await this.profileProposalService.accept(req.userId!, id);
    return result.proposal;
  }

  @Post('proposals/:id/reject')
  rejectProposal(@Req() req: Request, @Param('id') id: string) {
    return this.profileProposalService.reject(req.userId!, id);
  }

  @Get('health')
  health(@Req() req: Request) {
    this.assertV2Read();
    return this.profileMaintenanceService.health(req.userId!);
  }

  private assertV2Read() {
    if (!profileFeatureFlags.v2Read()) {
      throw profileAccessDenied('Profile V2 reads are disabled');
    }
  }
}
