import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  preview?: string;

  @IsOptional()
  @IsString()
  status?: 'active' | 'archived';

  @IsOptional()
  updatedAt?: Date;
}
