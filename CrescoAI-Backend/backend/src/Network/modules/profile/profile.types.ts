export const PROFILE_SCHEMA_VERSION = 'career_profile_v1' as const;

export interface BasicInfoResource {
  fullName: string;
  displayName: string;
  contactEmail: string;
  phoneOrPreferredContact: string;
  currentCity: string;
  profileAssets: string[];
}

export interface CareerProfileResource {
  candidateType: string;
  currentRole: string;
  employmentStatus: string;
  careerStage: string;
  educationBackground: string;
  workExperience: string;
  projectExperience: string;
  skills: string[];
  interests: string[];
  strengthTags: string[];
  weaknessTags: string[];
  personalityTraits: string[];
}

export interface IntentConstraintResource {
  targetIndustry: string;
  targetIndustries: string[];
  targetRole: string;
  targetCity: string;
  expectedSalary: string;
  availableTime: string;
  jobSearchStatus: string;
  constraints: string[];
  workPreferences: string[];
  learningPreferences: string[];
  careerGoal: string;
}

export interface ActivityRecordResource {
  learningRecords: string[];
  projectRecords: string[];
  applicationRecords: string[];
  interviewRecords: string[];
  offerRecords: string[];
  workRecords: string[];
}

export interface UserArtifactResource {
  resumeSummary: string;
  portfolioLinks: string[];
  projectMaterials: string[];
  coverLetters: string[];
}

export interface FeedbackSignalResource {
  userFeedback: string[];
  interviewFeedback: string[];
  mentorFeedback: string[];
  managerFeedback: string[];
  systemAssessmentFeedback: string[];
}

export interface PlanStateResource {
  learningPlan: string;
  projectPlan: string;
  applicationPlan: string;
  interviewPlan: string;
  onboardingPlan: string;
  promotionPlan: string;
}

export interface ChinaResumeSupplementResource {
  jobIntentionStatement: string;
  educationDetail: string;
  awardsCertificatesHighlights: string;
  conditionalFields: string;
}

export interface ProfileRecord {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  basicInfo: BasicInfoResource;
  careerProfile: CareerProfileResource;
  intentConstraints: IntentConstraintResource;
  activityRecords: ActivityRecordResource;
  artifacts: UserArtifactResource;
  feedbackSignals: FeedbackSignalResource;
  planState: PlanStateResource;
  chinaResumeSupplement: ChinaResumeSupplementResource;
}

type UnknownRecord = Record<string, unknown>;

const scalarFieldAliases = {
  fullName: ['fullName', 'full_name', 'displayName', 'display_name'],
  displayName: ['displayName', 'display_name', 'fullName', 'full_name'],
  contactEmail: ['contactEmail', 'contact_email'],
  phoneOrPreferredContact: [
    'phoneOrPreferredContact',
    'phone_or_preferred_contact',
    'preferredContact',
    'preferred_contact',
  ],
  currentCity: [
    'currentCity',
    'current_city',
    'currentCityOrTimezone',
    'current_city_or_timezone',
    'timezone',
    'locationRegion',
    'location_region',
    'target_city',
  ],
  candidateType: ['candidateType', 'candidate_type'],
  currentRole: ['currentRole', 'current_role'],
  employmentStatus: ['employmentStatus', 'employment_status'],
  careerStage: ['careerStage', 'career_stage'],
  educationBackground: [
    'educationBackground',
    'education_background',
    'educationAndTraining',
    'education_and_training',
    'educationSummary',
    'education_summary',
  ],
  workExperience: [
    'workExperience',
    'work_experience',
    'workExperienceSummary',
    'work_experience_summary',
    'experienceSummary',
    'experience_summary',
  ],
  projectExperience: [
    'projectExperience',
    'project_experience',
    'projectOrPracticeExperienceSummary',
    'project_or_practice_experience_summary',
  ],
  targetIndustry: ['targetIndustry', 'target_industry'],
  targetRole: ['targetRole', 'target_role'],
  targetCity: [
    'targetCity',
    'target_city',
    'targetCityOrWorkLocation',
    'target_city_or_work_location',
  ],
  expectedSalary: [
    'expectedSalary',
    'expected_salary',
    'compensationExpectation',
    'compensation_expectation',
  ],
  availableTime: [
    'availableTime',
    'available_time',
    'availabilityAndTimeline',
    'availability_and_timeline',
    'weeklyTimeBudget',
    'weekly_time_budget',
  ],
  jobSearchStatus: ['jobSearchStatus', 'job_search_status'],
  careerGoal: [
    'careerGoal',
    'career_goal',
    'longTermGoal',
    'long_term_goal',
    'shortTermGoal',
    'short_term_goal',
  ],
  resumeSummary: ['resumeSummary', 'resume_summary'],
  jobIntentionStatement: ['jobIntentionStatement', 'job_intention_statement'],
  educationDetail: [
    'educationDetail',
    'education_detail',
    'educationDetailForChineseResume',
    'education_detail_for_chinese_resume',
  ],
  awardsCertificatesHighlights: [
    'awardsCertificatesHighlights',
    'awards_certificates_highlights',
  ],
  conditionalFields: [
    'conditionalFields',
    'conditional_fields',
    'conditionalChinaResumeFields',
    'conditional_china_resume_fields',
    'workAuthorizationStatus',
    'work_authorization_status',
    'relocationRemotePreference',
    'relocation_remote_preference',
  ],
  learningPlan: ['learningPlan', 'learning_plan'],
  projectPlan: ['projectPlan', 'project_plan'],
  applicationPlan: ['applicationPlan', 'application_plan'],
  interviewPlan: ['interviewPlan', 'interview_plan'],
  onboardingPlan: ['onboardingPlan', 'onboarding_plan'],
  promotionPlan: ['promotionPlan', 'promotion_plan'],
} as const satisfies Record<string, readonly string[]>;

const listFieldAliases = {
  profileAssets: ['profileAssets', 'profile_assets'],
  skills: ['skills', 'coreSkills', 'core_skills', 'keyStrengths', 'key_strengths'],
  interests: ['interests', 'interestTags', 'interest_tags'],
  strengthTags: ['strengthTags', 'strength_tags'],
  weaknessTags: ['weaknessTags', 'weakness_tags', 'riskSignals', 'risk_signals'],
  personalityTraits: ['personalityTraits', 'personality_traits'],
  targetIndustries: ['targetIndustries', 'target_industries'],
  constraints: ['constraints'],
  workPreferences: ['workPreferences', 'work_preferences'],
  learningPreferences: ['learningPreferences', 'learning_preferences'],
  learningRecords: ['learningRecords', 'learning_records'],
  projectRecords: ['projectRecords', 'project_records'],
  applicationRecords: ['applicationRecords', 'application_records'],
  interviewRecords: ['interviewRecords', 'interview_records'],
  offerRecords: ['offerRecords', 'offer_records'],
  workRecords: ['workRecords', 'work_records'],
  portfolioLinks: ['portfolioLinks', 'portfolio_links'],
  projectMaterials: ['projectMaterials', 'project_materials'],
  coverLetters: ['coverLetters', 'cover_letters'],
  userFeedback: ['userFeedback', 'user_feedback'],
  interviewFeedback: ['interviewFeedback', 'interview_feedback'],
  mentorFeedback: ['mentorFeedback', 'mentor_feedback'],
  managerFeedback: ['managerFeedback', 'manager_feedback'],
  systemAssessmentFeedback: [
    'systemAssessmentFeedback',
    'system_assessment_feedback',
  ],
} as const satisfies Record<string, readonly string[]>;

export const profileInputFieldNames = [
  'basicInfo',
  'basic_info',
  'careerProfile',
  'career_profile',
  'intentConstraints',
  'intent_constraints',
  'activityRecords',
  'activity_records',
  'artifacts',
  'feedbackSignals',
  'feedback_signals',
  'planState',
  'plan_state',
  'chinaResumeSupplement',
  'china_resume_supplement',
  ...Object.values(scalarFieldAliases).flat(),
  ...Object.values(listFieldAliases).flat(),
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapProfile(input: unknown): UnknownRecord {
  if (!isRecord(input)) {
    return {};
  }

  return isRecord(input.profile) ? input.profile : input;
}

function readAlias(source: UnknownRecord, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (source[alias] !== undefined) {
      return source[alias];
    }
  }

  return undefined;
}

function readNested(source: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return {};
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function readText(
  nested: UnknownRecord,
  root: UnknownRecord,
  field: keyof typeof scalarFieldAliases,
  fallback = '',
) {
  return normalizeText(
    readAlias(nested, scalarFieldAliases[field])
      ?? readAlias(root, scalarFieldAliases[field]),
    fallback,
  );
}

function readList(
  nested: UnknownRecord,
  root: UnknownRecord,
  field: keyof typeof listFieldAliases,
) {
  const nestedValue = readAlias(nested, listFieldAliases[field]);
  const rootValue = readAlias(root, listFieldAliases[field]);
  return normalizeList(nestedValue ?? rootValue);
}

export function createDefaultProfile(displayName = ''): ProfileRecord {
  const normalizedDisplayName = displayName.trim();

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    basicInfo: {
      fullName: normalizedDisplayName,
      displayName: normalizedDisplayName,
      contactEmail: '',
      phoneOrPreferredContact: '',
      currentCity: '',
      profileAssets: [],
    },
    careerProfile: {
      candidateType: '',
      currentRole: '',
      employmentStatus: '',
      careerStage: '',
      educationBackground: '',
      workExperience: '',
      projectExperience: '',
      skills: [],
      interests: [],
      strengthTags: [],
      weaknessTags: [],
      personalityTraits: [],
    },
    intentConstraints: {
      targetIndustry: '',
      targetIndustries: [],
      targetRole: '',
      targetCity: '',
      expectedSalary: '',
      availableTime: '',
      jobSearchStatus: '',
      constraints: [],
      workPreferences: [],
      learningPreferences: [],
      careerGoal: '',
    },
    activityRecords: {
      learningRecords: [],
      projectRecords: [],
      applicationRecords: [],
      interviewRecords: [],
      offerRecords: [],
      workRecords: [],
    },
    artifacts: {
      resumeSummary: '',
      portfolioLinks: [],
      projectMaterials: [],
      coverLetters: [],
    },
    feedbackSignals: {
      userFeedback: [],
      interviewFeedback: [],
      mentorFeedback: [],
      managerFeedback: [],
      systemAssessmentFeedback: [],
    },
    planState: {
      learningPlan: '',
      projectPlan: '',
      applicationPlan: '',
      interviewPlan: '',
      onboardingPlan: '',
      promotionPlan: '',
    },
    chinaResumeSupplement: {
      jobIntentionStatement: '',
      educationDetail: '',
      awardsCertificatesHighlights: '',
      conditionalFields: '',
    },
  };
}

/**
 * Accept the canonical v1 resource shape and legacy/sample flat camelCase or
 * snake_case fields. The profile payload may also arrive as `{ _meta, profile }`.
 */
export function normalizeProfileRecord(
  input: unknown,
  fallbackDisplayName = '',
): ProfileRecord {
  const source = unwrapProfile(input);
  const fallback = createDefaultProfile(fallbackDisplayName);
  const basicInfo = readNested(source, 'basicInfo', 'basic_info');
  const careerProfile = readNested(source, 'careerProfile', 'career_profile');
  const intentConstraints = readNested(
    source,
    'intentConstraints',
    'intent_constraints',
  );
  const activityRecords = readNested(
    source,
    'activityRecords',
    'activity_records',
  );
  const artifacts = readNested(source, 'artifacts');
  const feedbackSignals = readNested(
    source,
    'feedbackSignals',
    'feedback_signals',
  );
  const planState = readNested(source, 'planState', 'plan_state');
  const chinaResumeSupplement = readNested(
    source,
    'chinaResumeSupplement',
    'china_resume_supplement',
  );

  const fullName = readText(
    basicInfo,
    source,
    'fullName',
    fallback.basicInfo.fullName,
  );
  const displayName = readText(
    basicInfo,
    source,
    'displayName',
    fallback.basicInfo.displayName,
  );
  const targetIndustries = readList(
    intentConstraints,
    source,
    'targetIndustries',
  );

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    basicInfo: {
      fullName,
      displayName,
      contactEmail: readText(basicInfo, source, 'contactEmail'),
      phoneOrPreferredContact: readText(
        basicInfo,
        source,
        'phoneOrPreferredContact',
      ),
      currentCity: readText(basicInfo, source, 'currentCity'),
      profileAssets: readList(basicInfo, source, 'profileAssets'),
    },
    careerProfile: {
      candidateType: readText(careerProfile, source, 'candidateType'),
      currentRole: readText(careerProfile, source, 'currentRole'),
      employmentStatus: readText(careerProfile, source, 'employmentStatus'),
      careerStage: readText(careerProfile, source, 'careerStage'),
      educationBackground: readText(
        careerProfile,
        source,
        'educationBackground',
      ),
      workExperience: readText(careerProfile, source, 'workExperience'),
      projectExperience: readText(careerProfile, source, 'projectExperience'),
      skills: readList(careerProfile, source, 'skills'),
      interests: readList(careerProfile, source, 'interests'),
      strengthTags: readList(careerProfile, source, 'strengthTags'),
      weaknessTags: readList(careerProfile, source, 'weaknessTags'),
      personalityTraits: readList(careerProfile, source, 'personalityTraits'),
    },
    intentConstraints: {
      targetIndustry: readText(intentConstraints, source, 'targetIndustry')
        || targetIndustries[0]
        || '',
      targetIndustries,
      targetRole: readText(intentConstraints, source, 'targetRole'),
      targetCity: readText(intentConstraints, source, 'targetCity'),
      expectedSalary: readText(intentConstraints, source, 'expectedSalary'),
      availableTime: readText(intentConstraints, source, 'availableTime'),
      jobSearchStatus: readText(intentConstraints, source, 'jobSearchStatus'),
      constraints: readList(intentConstraints, source, 'constraints'),
      workPreferences: readList(intentConstraints, source, 'workPreferences'),
      learningPreferences: readList(
        intentConstraints,
        source,
        'learningPreferences',
      ),
      careerGoal: readText(intentConstraints, source, 'careerGoal'),
    },
    activityRecords: {
      learningRecords: readList(activityRecords, source, 'learningRecords'),
      projectRecords: readList(activityRecords, source, 'projectRecords'),
      applicationRecords: readList(
        activityRecords,
        source,
        'applicationRecords',
      ),
      interviewRecords: readList(activityRecords, source, 'interviewRecords'),
      offerRecords: readList(activityRecords, source, 'offerRecords'),
      workRecords: readList(activityRecords, source, 'workRecords'),
    },
    artifacts: {
      resumeSummary: readText(artifacts, source, 'resumeSummary'),
      portfolioLinks: readList(artifacts, source, 'portfolioLinks'),
      projectMaterials: readList(artifacts, source, 'projectMaterials'),
      coverLetters: readList(artifacts, source, 'coverLetters'),
    },
    feedbackSignals: {
      userFeedback: readList(feedbackSignals, source, 'userFeedback'),
      interviewFeedback: readList(feedbackSignals, source, 'interviewFeedback'),
      mentorFeedback: readList(feedbackSignals, source, 'mentorFeedback'),
      managerFeedback: readList(feedbackSignals, source, 'managerFeedback'),
      systemAssessmentFeedback: readList(
        feedbackSignals,
        source,
        'systemAssessmentFeedback',
      ),
    },
    planState: {
      learningPlan: readText(planState, source, 'learningPlan'),
      projectPlan: readText(planState, source, 'projectPlan'),
      applicationPlan: readText(planState, source, 'applicationPlan'),
      interviewPlan: readText(planState, source, 'interviewPlan'),
      onboardingPlan: readText(planState, source, 'onboardingPlan'),
      promotionPlan: readText(planState, source, 'promotionPlan'),
    },
    chinaResumeSupplement: {
      jobIntentionStatement: readText(
        chinaResumeSupplement,
        source,
        'jobIntentionStatement',
      ),
      educationDetail: readText(chinaResumeSupplement, source, 'educationDetail'),
      awardsCertificatesHighlights: readText(
        chinaResumeSupplement,
        source,
        'awardsCertificatesHighlights',
      ),
      conditionalFields: readText(
        chinaResumeSupplement,
        source,
        'conditionalFields',
      ),
    },
  };
}

export function hasProfileInputFields(input: unknown) {
  const source = unwrapProfile(input);
  return profileInputFieldNames.some((field) =>
    Object.prototype.hasOwnProperty.call(source, field),
  );
}
