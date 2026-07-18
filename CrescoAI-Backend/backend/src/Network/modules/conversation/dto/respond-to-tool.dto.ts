import {
  IsBoolean,
  IsObject,
  IsOptional,
} from 'class-validator';

export class RespondToToolDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @IsOptional()
  @IsObject()
  annotations?: Record<string, { preview?: string; notes?: string }>;
}
