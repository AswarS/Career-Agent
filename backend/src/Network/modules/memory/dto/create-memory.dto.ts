import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMemoryDto {
  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tags?: string;
}
