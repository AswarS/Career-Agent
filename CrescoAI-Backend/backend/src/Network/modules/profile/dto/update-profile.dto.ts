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
  @IsOptional()
  @IsObject()
  basicInfo?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  basic_info?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  careerProfile?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  career_profile?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  intentConstraints?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  intent_constraints?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  activityRecords?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  activity_records?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  artifacts?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  feedbackSignals?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  feedback_signals?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  planState?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  plan_state?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  chinaResumeSupplement?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  china_resume_supplement?: Record<string, unknown>;

  @textField()
  fullName?: string;

  @textField()
  full_name?: string;

  @textField()
  candidateType?: string;

  @textField()
  candidate_type?: string;

  @textField()
  currentRole?: string;

  @textField()
  current_role?: string;

  @textField()
  employmentStatus?: string;

  @textField()
  employment_status?: string;

  @textField()
  currentCountryOrRegion?: string;

  @textField()
  current_country_or_region?: string;

  @textField()
  currentCityOrTimezone?: string;

  @textField()
  current_city_or_timezone?: string;

  @textField()
  currentCity?: string;

  @textField()
  current_city?: string;

  @textField()
  contactEmail?: string;

  @textField()
  contact_email?: string;

  @textField()
  phoneOrPreferredContact?: string;

  @textField()
  phone_or_preferred_contact?: string;

  @textField()
  displayName?: string;

  @textField()
  display_name?: string;

  @textField()
  locale?: string;

  @textField()
  timezone?: string;

  @textField()
  locationRegion?: string;

  @textField()
  location_region?: string;

  @textField()
  targetRole?: string;

  @textField()
  target_role?: string;

  @textField()
  careerStage?: string;

  @textField()
  career_stage?: string;

  @textField()
  educationBackground?: string;

  @textField()
  education_background?: string;

  @textField()
  workExperience?: string;

  @textField()
  work_experience?: string;

  @textField()
  projectExperience?: string;

  @textField()
  project_experience?: string;

  @textField()
  targetIndustry?: string;

  @textField()
  target_industry?: string;

  @listField()
  targetIndustries?: string[];

  @listField()
  target_industries?: string[];

  @textField()
  jobIntentionStatement?: string;

  @textField()
  job_intention_statement?: string;

  @textField()
  targetCityOrWorkLocation?: string;

  @textField()
  target_city_or_work_location?: string;

  @textField()
  targetCity?: string;

  @textField()
  target_city?: string;

  @textField()
  targetCountryOrMarket?: string;

  @textField()
  target_country_or_market?: string;

  @textField()
  workAuthorizationStatus?: string;

  @textField()
  work_authorization_status?: string;

  @textField()
  relocationRemotePreference?: string;

  @textField()
  relocation_remote_preference?: string;

  @textField()
  yearsOfExperience?: string;

  @textField()
  years_of_experience?: string;

  @textField()
  workExperienceSummary?: string;

  @textField()
  work_experience_summary?: string;

  @textField()
  projectOrPracticeExperienceSummary?: string;

  @textField()
  project_or_practice_experience_summary?: string;

  @textField()
  awardsCertificatesHighlights?: string;

  @textField()
  awards_certificates_highlights?: string;

  @textField()
  conditionalChinaResumeFields?: string;

  @textField()
  conditional_china_resume_fields?: string;

  @textField()
  educationAndTraining?: string;

  @textField()
  education_and_training?: string;

  @textField()
  educationDetailForChineseResume?: string;

  @textField()
  education_detail_for_chinese_resume?: string;

  @listField()
  coreSkills?: string[];

  @listField()
  core_skills?: string[];

  @textField()
  languageProficiency?: string;

  @textField()
  language_proficiency?: string;

  @textField()
  availabilityAndTimeline?: string;

  @textField()
  availability_and_timeline?: string;

  @textField()
  compensationExpectation?: string;

  @textField()
  compensation_expectation?: string;

  @textField()
  expectedSalary?: string;

  @textField()
  expected_salary?: string;

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

  @textField()
  availableTime?: string;

  @textField()
  available_time?: string;

  @textField()
  jobSearchStatus?: string;

  @textField()
  job_search_status?: string;

  @textField()
  careerGoal?: string;

  @textField()
  career_goal?: string;

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
  skills?: string[];

  @listField()
  interests?: string[];

  @listField()
  strengthTags?: string[];

  @listField()
  strength_tags?: string[];

  @listField()
  weaknessTags?: string[];

  @listField()
  weakness_tags?: string[];

  @listField()
  personalityTraits?: string[];

  @listField()
  personality_traits?: string[];

  @listField()
  learningRecords?: string[];

  @listField()
  learning_records?: string[];

  @listField()
  projectRecords?: string[];

  @listField()
  project_records?: string[];

  @listField()
  applicationRecords?: string[];

  @listField()
  application_records?: string[];

  @listField()
  interviewRecords?: string[];

  @listField()
  interview_records?: string[];

  @listField()
  offerRecords?: string[];

  @listField()
  offer_records?: string[];

  @listField()
  workRecords?: string[];

  @listField()
  work_records?: string[];

  @listField()
  riskSignals?: string[];

  @listField()
  risk_signals?: string[];

  @listField()
  portfolioLinks?: string[];

  @listField()
  portfolio_links?: string[];

  @listField()
  profileAssets?: string[];

  @listField()
  profile_assets?: string[];

  @listField()
  projectMaterials?: string[];

  @listField()
  project_materials?: string[];

  @listField()
  coverLetters?: string[];

  @listField()
  cover_letters?: string[];

  @listField()
  userFeedback?: string[];

  @listField()
  user_feedback?: string[];

  @listField()
  interviewFeedback?: string[];

  @listField()
  interview_feedback?: string[];

  @listField()
  mentorFeedback?: string[];

  @listField()
  mentor_feedback?: string[];

  @listField()
  managerFeedback?: string[];

  @listField()
  manager_feedback?: string[];

  @listField()
  systemAssessmentFeedback?: string[];

  @listField()
  system_assessment_feedback?: string[];

  @textField()
  resumeSummary?: string;

  @textField()
  resume_summary?: string;

  @textField()
  educationDetail?: string;

  @textField()
  education_detail?: string;

  @textField()
  conditionalFields?: string;

  @textField()
  conditional_fields?: string;

  @textField()
  learningPlan?: string;

  @textField()
  learning_plan?: string;

  @textField()
  projectPlan?: string;

  @textField()
  project_plan?: string;

  @textField()
  applicationPlan?: string;

  @textField()
  application_plan?: string;

  @textField()
  interviewPlan?: string;

  @textField()
  interview_plan?: string;

  @textField()
  onboardingPlan?: string;

  @textField()
  onboarding_plan?: string;

  @textField()
  promotionPlan?: string;

  @textField()
  promotion_plan?: string;
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
