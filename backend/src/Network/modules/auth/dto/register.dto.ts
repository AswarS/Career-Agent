import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  username?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  display_name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsString()
  displayName?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
