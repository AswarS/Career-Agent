import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class EducationBackgroundItemDto {
  @IsString()
  @MaxLength(300)
  school!: string;

  @IsString()
  @MaxLength(300)
  major!: string;

  @IsString()
  @MaxLength(100)
  degree!: string;

  @IsOptional()
  @IsDateString()
  graduationDate?: string | null;

  @IsString()
  @MaxLength(2_000)
  description!: string;
}

export class UpdateBaseProfileDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gender?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  educationLevel?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EducationBackgroundItemDto)
  educationBackground?: EducationBackgroundItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  currentRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  currentIndustry?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(80)
  yearsOfExperience?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactLanguage?: string;
}

export class AgentBaseProfileProposalDto extends UpdateBaseProfileDto {
  @IsIn(['user_explicit', 'user_confirmed', 'system_correction'])
  sourceType!: 'user_explicit' | 'user_confirmed' | 'system_correction';

  @IsOptional()
  @IsString()
  sourceConversationId?: string;

  @IsOptional()
  @IsString()
  sourceMessageId?: string;
}
