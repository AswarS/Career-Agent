import { IsObject, IsOptional, IsString } from 'class-validator';

export class InvokeSkillDto {
  @IsOptional()
  @IsString()
  args?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
