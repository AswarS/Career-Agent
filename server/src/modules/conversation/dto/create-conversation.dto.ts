import { IsOptional, IsString } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  userId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  preview?: string;

  @IsOptional()
  updatedAt?: Date;
}
