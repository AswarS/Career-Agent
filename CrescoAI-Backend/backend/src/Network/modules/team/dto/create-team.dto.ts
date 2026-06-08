import { IsString, IsOptional, IsObject, IsArray, IsEnum } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['ecommerce-mvp', 'general', 'custom'])
  domain?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  members?: TeamMemberDto[];
}

export interface TeamMemberDto {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  config?: Record<string, unknown>;
}
