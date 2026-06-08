import { IsOptional, IsObject, IsString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
