import { IsString, IsOptional, IsObject } from 'class-validator';

export class ExecuteTaskDto {
  @IsString()
  task!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
