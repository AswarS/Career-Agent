import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto, UpdateTeamDto, ExecuteTaskDto } from './dto';
import type { TeamMember } from './entities/team.entity';
import type { Request } from 'express';

@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: Request, @Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(req.userId!, createTeamDto);
  }

  @Get()
  findAll(@Req() req: Request) {
    return this.teamService.findAll(req.userId!);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.findOne(id, req.userId!);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamService.update(id, req.userId!, updateTeamDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.teamService.remove(id, req.userId!);
  }

  @Post(':id/tasks')
  executeTask(@Req() req: Request, @Param('id') id: string, @Body() executeTaskDto: ExecuteTaskDto) {
    return this.teamService.executeTask(id, req.userId!, executeTaskDto);
  }

  @Post(':id/members')
  addMember(@Req() req: Request, @Param('id') id: string, @Body() member: TeamMember) {
    return this.teamService.addMember(id, req.userId!, member);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Req() req: Request, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.teamService.removeMember(id, req.userId!, memberId);
  }
}
