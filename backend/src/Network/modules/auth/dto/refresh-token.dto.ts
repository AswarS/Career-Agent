import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refresh_token?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
