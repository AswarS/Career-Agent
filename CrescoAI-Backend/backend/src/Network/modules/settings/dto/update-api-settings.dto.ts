import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class UpdateApiSettingsDto {
  @IsOptional()
  @IsString()
  provider?: string;

  /** snake_case alias accepted from frontend */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  api_key?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  apiKey?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  model?: string;

  /** snake_case alias accepted from frontend */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  base_url?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  baseUrl?: string;

  // TODO: thinking mode — future frontend setting
  // thinking_mode?: 'disabled' | 'adaptive' | 'enabled'
  // thinkingMode?: 'disabled' | 'adaptive' | 'enabled'
  // thinking_budget?: number

  // ── Image generation ──────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  image_key?: string;

  @IsOptional()
  @IsString()
  imageKey?: string;

  @IsOptional()
  @IsString()
  image_default_model?: string;

  @IsOptional()
  @IsString()
  imageDefaultModel?: string;

  /** Comma-separated or JSON array string */
  @IsOptional()
  @IsString()
  image_models?: string;

  @IsOptional()
  @IsString()
  imageModels?: string;

  // ── Video generation ──────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  video_url?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  video_key?: string;

  @IsOptional()
  @IsString()
  videoKey?: string;

  @IsOptional()
  @IsString()
  video_default_model?: string;

  @IsOptional()
  @IsString()
  videoDefaultModel?: string;

  @IsOptional()
  @IsString()
  video_models?: string;

  @IsOptional()
  @IsString()
  videoModels?: string;
}
