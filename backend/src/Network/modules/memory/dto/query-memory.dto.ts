import { IsOptional, IsString } from 'class-validator';

export class QueryMemoryDto {
  @IsOptional()
  @IsString()
  category?: string;
}
