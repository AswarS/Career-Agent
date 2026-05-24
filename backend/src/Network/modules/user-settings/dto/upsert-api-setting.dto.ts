import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertApiSettingDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim().toLowerCase()))
  @IsString()
  @MaxLength(40)
  provider?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim()))
  @IsString()
  api_key?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim()))
  @IsString()
  apiKey?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim()))
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim()))
  @IsString()
  @MaxLength(300)
  base_url?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value.trim()))
  @IsString()
  @MaxLength(300)
  baseUrl?: string;
}
