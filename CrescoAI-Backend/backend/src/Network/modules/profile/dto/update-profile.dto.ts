import { Type } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const textField = () =>
  applyDecorators(IsOptional(), IsString(), MaxLength(4_000));
const listField = () =>
  applyDecorators(
    IsOptional(),
    IsArray(),
    ArrayMaxSize(50),
    IsString({ each: true }),
    MaxLength(500, { each: true }),
  );

export class ProfileFieldsDto {
  @textField()
  displayName?: string;

  @textField()
  display_name?: string;

  @textField()
  locale?: string;

  @textField()
  timezone?: string;

  @textField()
  currentRole?: string;

  @textField()
  current_role?: string;

  @textField()
  employmentStatus?: string;

  @textField()
  employment_status?: string;

  @textField()
  experienceSummary?: string;

  @textField()
  experience_summary?: string;

  @textField()
  educationSummary?: string;

  @textField()
  education_summary?: string;

  @textField()
  locationRegion?: string;

  @textField()
  location_region?: string;

  @textField()
  targetRole?: string;

  @textField()
  target_role?: string;

  @listField()
  targetIndustries?: string[];

  @listField()
  target_industries?: string[];

  @textField()
  shortTermGoal?: string;

  @textField()
  short_term_goal?: string;

  @textField()
  longTermGoal?: string;

  @textField()
  long_term_goal?: string;

  @textField()
  weeklyTimeBudget?: string;

  @textField()
  weekly_time_budget?: string;

  @listField()
  constraints?: string[];

  @listField()
  workPreferences?: string[];

  @listField()
  work_preferences?: string[];

  @listField()
  learningPreferences?: string[];

  @listField()
  learning_preferences?: string[];

  @listField()
  keyStrengths?: string[];

  @listField()
  key_strengths?: string[];

  @listField()
  riskSignals?: string[];

  @listField()
  risk_signals?: string[];

  @listField()
  portfolioLinks?: string[];

  @listField()
  portfolio_links?: string[];
}

export class UpdateProfileDto extends ProfileFieldsDto {
  @IsOptional()
  @IsObject()
  _meta?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileFieldsDto)
  profile?: ProfileFieldsDto;
}
