export interface ProfileRecord {
  displayName: string;
  locale: string;
  timezone: string;
  currentRole: string;
  employmentStatus: string;
  experienceSummary: string;
  educationSummary: string;
  locationRegion: string;
  targetRole: string;
  targetIndustries: string[];
  shortTermGoal: string;
  longTermGoal: string;
  weeklyTimeBudget: string;
  constraints: string[];
  workPreferences: string[];
  learningPreferences: string[];
  keyStrengths: string[];
  riskSignals: string[];
  portfolioLinks: string[];
}

type UnknownRecord = Record<string, unknown>;

const scalarFieldAliases = {
  displayName: ['displayName', 'display_name'],
  locale: ['locale'],
  timezone: ['timezone'],
  currentRole: ['currentRole', 'current_role'],
  employmentStatus: ['employmentStatus', 'employment_status'],
  experienceSummary: ['experienceSummary', 'experience_summary'],
  educationSummary: ['educationSummary', 'education_summary'],
  locationRegion: ['locationRegion', 'location_region'],
  targetRole: ['targetRole', 'target_role'],
  shortTermGoal: ['shortTermGoal', 'short_term_goal'],
  longTermGoal: ['longTermGoal', 'long_term_goal'],
  weeklyTimeBudget: ['weeklyTimeBudget', 'weekly_time_budget'],
} as const satisfies Record<string, readonly string[]>;

const listFieldAliases = {
  targetIndustries: ['targetIndustries', 'target_industries'],
  constraints: ['constraints'],
  workPreferences: ['workPreferences', 'work_preferences'],
  learningPreferences: ['learningPreferences', 'learning_preferences'],
  keyStrengths: ['keyStrengths', 'key_strengths'],
  riskSignals: ['riskSignals', 'risk_signals'],
  portfolioLinks: ['portfolioLinks', 'portfolio_links'],
} as const satisfies Record<string, readonly string[]>;

export const profileInputFieldNames = [
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

export function createDefaultProfile(displayName = ''): ProfileRecord {
  return {
    displayName: displayName.trim(),
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    currentRole: '',
    employmentStatus: '',
    experienceSummary: '',
    educationSummary: '',
    locationRegion: '',
    targetRole: '',
    targetIndustries: [],
    shortTermGoal: '',
    longTermGoal: '',
    weeklyTimeBudget: '',
    constraints: [],
    workPreferences: [],
    learningPreferences: [],
    keyStrengths: [],
    riskSignals: [],
    portfolioLinks: [],
  };
}

/**
 * Accept both the frontend camelCase shape and legacy/sample snake_case or
 * `{ _meta, profile }` documents. `_meta` contains fixture/planning metadata
 * and is intentionally not persisted as editable user profile data.
 */
export function normalizeProfileRecord(
  input: unknown,
  fallbackDisplayName = '',
): ProfileRecord {
  const source = unwrapProfile(input);
  const fallback = createDefaultProfile(fallbackDisplayName);
  const scalarValues = Object.fromEntries(
    Object.entries(scalarFieldAliases).map(([key, aliases]) => [
      key,
      normalizeText(
        readAlias(source, aliases),
        fallback[key as keyof ProfileRecord] as string,
      ),
    ]),
  ) as Pick<ProfileRecord, keyof typeof scalarFieldAliases>;
  const listValues = Object.fromEntries(
    Object.entries(listFieldAliases).map(([key, aliases]) => [
      key,
      normalizeList(readAlias(source, aliases)),
    ]),
  ) as Pick<ProfileRecord, keyof typeof listFieldAliases>;

  return {
    ...fallback,
    ...scalarValues,
    ...listValues,
  };
}

export function hasProfileInputFields(input: unknown) {
  const source = unwrapProfile(input);
  return profileInputFieldNames.some((field) =>
    Object.prototype.hasOwnProperty.call(source, field),
  );
}
