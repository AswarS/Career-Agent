import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SkillService } from './skill.service';
import { RegisterSkillDto, InvokeSkillDto } from './dto';

@Controller('api/career-agent/skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  listSkills(@Query('category') category?: string) {
    return this.skillService.listSkills(category);
  }

  @Get(':name')
  getSkillDetail(@Param('name') name: string) {
    const detail = this.skillService.getSkillDetail(name);
    if (!detail) {
      return { error: 'Skill not found', skill: name };
    }
    return detail;
  }

  @Post()
  registerSkill(@Body() dto: RegisterSkillDto) {
    return this.skillService.registerSkill(dto.name, dto.description, dto.category as any);
  }

  @Post(':name/invoke')
  invokeSkill(@Param('name') name: string, @Body() dto: InvokeSkillDto) {
    return this.skillService.invokeSkill(name, dto.args ?? '', dto.context);
  }
}
