import { IsOptional, IsString } from 'class-validator';

export class UpdateApiSettingsDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  model?: string;
}
