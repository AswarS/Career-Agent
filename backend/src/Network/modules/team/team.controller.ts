import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto, UpdateTeamDto, ExecuteTaskDto } from './dto';
import type { TeamMember } from './entities/team.entity';

@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamService.create(createTeamDto);
  }

  @Get()
  findAll() {
    return this.teamService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamService.update(id, updateTeamDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.teamService.remove(id);
  }

  @Post(':id/tasks')
  executeTask(@Param('id') id: string, @Body() executeTaskDto: ExecuteTaskDto) {
    return this.teamService.executeTask(id, executeTaskDto);
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body() member: TeamMember) {
    return this.teamService.addMember(id, member);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.teamService.removeMember(id, memberId);
  }
}
