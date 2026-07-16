import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const priorities = ['hard_constraint', 'high', 'normal', 'background'];
const scopes = ['long_term', 'short_term'];
const statuses = ['active', 'superseded', 'expired', 'deleted'];

export class CreateProfileMemoryDto {
  @IsString()
  @MaxLength(2_000)
  content!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slotKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  appliesTo?: string[];

  @IsIn(scopes)
  timeScope!: 'long_term' | 'short_term';

  @IsIn(priorities)
  priority!: 'hard_constraint' | 'high' | 'normal' | 'background';

  @IsOptional()
  @IsIn(['L1', 'L2', 'L3'])
  profileLevel?: 'L1' | 'L2' | 'L3';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateProfileMemoryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slotKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  appliesTo?: string[];

  @IsOptional()
  @IsIn(scopes)
  timeScope?: 'long_term' | 'short_term';

  @IsOptional()
  @IsIn(priorities)
  priority?: 'hard_constraint' | 'high' | 'normal' | 'background';

  @IsOptional()
  @IsIn(['L1', 'L2', 'L3'])
  profileLevel?: 'L1' | 'L2' | 'L3';

  @IsOptional()
  @IsIn(statuses)
  status?: 'active' | 'superseded' | 'expired' | 'deleted';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class ReplaceProfileMemoryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MaxLength(2_000)
  content!: string;

  @IsIn(['L1', 'L2', 'L3'])
  profileLevel!: 'L1' | 'L2' | 'L3';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slotKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  appliesTo?: string[];

  @IsOptional()
  @IsIn(scopes)
  timeScope?: 'long_term' | 'short_term';

  @IsOptional()
  @IsIn(priorities)
  priority?: 'hard_constraint' | 'high' | 'normal' | 'background';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class QueryProfileMemoryDto {
  @IsOptional()
  @IsIn(['L1', 'L2', 'L3'])
  profileLevel?: 'L1' | 'L2' | 'L3';

  @IsOptional()
  @IsIn(scopes)
  timeScope?: 'long_term' | 'short_term';

  @IsOptional()
  @IsIn(priorities)
  priority?: 'hard_constraint' | 'high' | 'normal' | 'background';

  @IsOptional()
  @IsIn(statuses)
  status?: 'active' | 'superseded' | 'expired' | 'deleted';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class DeleteProfileMemoryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
