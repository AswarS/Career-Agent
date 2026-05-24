import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUsernameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  username!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsString()
  @MaxLength(80)
  display_name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsString()
  @MaxLength(80)
  displayName?: string;
}
