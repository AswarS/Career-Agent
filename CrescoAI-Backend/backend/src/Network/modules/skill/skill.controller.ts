import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkillService } from './skill.service';
import { CreateSkillDto, UpdateSkillDto, InvokeSkillDto } from './dto';

@Controller('api/career-agent/skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  listSkills(
    @Req() req: Request,
    @Query('category') category?: string,
  ) {
    return this.skillService.listSkills(req.userId, category);
  }

  @Get(':name')
  getSkillDetail(@Req() req: Request, @Param('name') name: string) {
    return this.skillService.getSkillDetail(name, req.userId);
  }

  @Post()
  async createSkill(@Req() req: Request, @Body() dto: CreateSkillDto) {
    return this.skillService.createCustomSkill(
      req.userId,
      dto.name,
      dto.description,
      dto.content,
      dto.category,
      dto.arguments,
    );
  }

  @Put(':name')
  async updateSkill(
    @Req() req: Request,
    @Param('name') name: string,
    @Body() dto: UpdateSkillDto,
  ) {
    const ok = await this.skillService.updateCustomSkill(req.userId, name, {
      description: dto.description,
      content: dto.content,
      category: dto.category,
      argNames: dto.arguments,
    });
    return { success: ok };
  }

  @Delete(':name')
  async deleteSkill(@Req() req: Request, @Param('name') name: string) {
    const ok = await this.skillService.deleteCustomSkill(req.userId, name);
    return { success: ok };
  }

  @Post(':name/invoke')
  invokeSkill(
    @Req() req: Request,
    @Param('name') name: string,
    @Body() dto: InvokeSkillDto,
  ) {
    return this.skillService.invokeSkillThroughCc(name, dto.args ?? '', {
      ...dto.context,
      userId: req.userId,
    });
  }
}
