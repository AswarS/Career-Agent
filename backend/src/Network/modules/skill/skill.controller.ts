import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SkillService } from './skill.service';
import { RegisterSkillDto, InvokeSkillDto } from './dto';

@Controller('api/career-agent/skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  listSkills() {
    return this.skillService.listSkills();
  }

  @Post()
  registerSkill(@Body() dto: RegisterSkillDto) {
    return this.skillService.registerSkill(dto.name, dto.description);
  }

  @Post(':name/invoke')
  invokeSkill(@Param('name') name: string, @Body() dto: InvokeSkillDto) {
    return this.skillService.invokeSkill(name, dto.args ?? '', dto.context);
  }
}
