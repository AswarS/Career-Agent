import { IsOptional, IsString } from 'class-validator';

export class RegisterSkillDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
