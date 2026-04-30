import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamEntity, TeamMember } from './entities/team.entity';
import { CreateTeamDto, UpdateTeamDto, ExecuteTaskDto } from './dto';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamEntity)
    private teamRepository: Repository<TeamEntity>,
  ) {}

  async create(createTeamDto: CreateTeamDto): Promise<TeamEntity> {
    const team = this.teamRepository.create({
      ...createTeamDto,
      domain: createTeamDto.domain || 'ecommerce-mvp',
    });
    return await this.teamRepository.save(team);
  }

  async findAll(): Promise<TeamEntity[]> {
    return await this.teamRepository.find();
  }

  async findOne(id: string): Promise<TeamEntity> {
    const team = await this.teamRepository.findOne({ where: { id } as any });
    if (!team) {
      throw new NotFoundException(`Team with ID ${id} not found`);
    }
    return team;
  }

  async update(id: string, updateTeamDto: UpdateTeamDto): Promise<TeamEntity> {
    await this.teamRepository.update(id, updateTeamDto);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.teamRepository.delete(id);
  }

  async executeTask(teamId: string, executeTaskDto: ExecuteTaskDto): Promise<{
    taskId: string;
    status: string;
    result?: string;
    assignedTo?: string;
  }> {
    const team = await this.findOne(teamId);

    // For now, return a stub response
    // In a full implementation, this would:
    // 1. Analyze the task
    // 2. Select appropriate team member(s)
    // 3. Execute the task using the selected member's capabilities
    // 4. Return the result

    return {
      taskId: `task_${Date.now()}`,
      status: 'completed',
      result: `Task executed by team "${team.name}": ${executeTaskDto.task}`,
      assignedTo: executeTaskDto.assignedTo || team.members?.[0]?.id || 'unassigned',
    };
  }

  async addMember(teamId: string, member: TeamMember): Promise<TeamEntity> {
    const team = await this.findOne(teamId);
    if (!team.members) {
      team.members = [];
    }
    team.members.push(member);
    return await this.teamRepository.save(team);
  }

  async removeMember(teamId: string, memberId: string): Promise<TeamEntity> {
    const team = await this.findOne(teamId);
    if (team.members) {
      team.members = team.members.filter(m => m.id !== memberId);
      return await this.teamRepository.save(team);
    }
    return team;
  }
}
