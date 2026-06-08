import { IsOptional, IsString } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  arguments?: string;
}

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  arguments?: string;
}