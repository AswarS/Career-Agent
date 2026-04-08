import type { ProfileRecord } from '../../types/entities';

export type ScalarProfileFieldKey =
  | 'displayName'
  | 'locale'
  | 'timezone'
  | 'currentRole'
  | 'employmentStatus'
  | 'experienceSummary'
  | 'educationSummary'
  | 'locationRegion'
  | 'targetRole'
  | 'shortTermGoal'
  | 'longTermGoal'
  | 'weeklyTimeBudget';

export type ListProfileFieldKey =
  | 'targetIndustries'
  | 'constraints'
  | 'workPreferences'
  | 'learningPreferences'
  | 'keyStrengths'
  | 'riskSignals'
  | 'portfolioLinks';

export interface ScalarProfileFieldConfig {
  key: ScalarProfileFieldKey;
  label: string;
  input: 'text' | 'textarea';
  description: string;
}

export interface ListProfileFieldConfig {
  key: ListProfileFieldKey;
  label: string;
  description: string;
}

export interface ProfileSnapshotItem {
  label: string;
  value: string | string[];
}

export const scalarProfileFields: ScalarProfileFieldConfig[] = [
  { key: 'displayName', label: 'Display Name', input: 'text', description: 'How this user should be identified in the workspace.' },
  { key: 'locale', label: 'Locale', input: 'text', description: 'Preferred language and formatting locale.' },
  { key: 'timezone', label: 'Timezone', input: 'text', description: 'Primary timezone for plans and reminders.' },
  { key: 'currentRole', label: 'Current Role', input: 'text', description: 'Current work identity or operating mode.' },
  { key: 'employmentStatus', label: 'Employment Status', input: 'text', description: 'Current job or search context.' },
  { key: 'locationRegion', label: 'Location Region', input: 'text', description: 'Location and remote preference context.' },
  { key: 'weeklyTimeBudget', label: 'Weekly Time Budget', input: 'text', description: 'Available focused time for career progress.' },
  { key: 'targetRole', label: 'Target Role', input: 'text', description: 'Next role or direction the user is moving toward.' },
  { key: 'shortTermGoal', label: 'Short-Term Goal', input: 'textarea', description: 'Near-term execution target.' },
  { key: 'longTermGoal', label: 'Long-Term Goal', input: 'textarea', description: 'Longer-horizon direction.' },
  { key: 'experienceSummary', label: 'Experience Summary', input: 'textarea', description: 'Compact explanation of previous work and strengths.' },
  { key: 'educationSummary', label: 'Education Summary', input: 'textarea', description: 'Formal and self-directed learning context.' },
];

export const listProfileFields: ListProfileFieldConfig[] = [
  { key: 'targetIndustries', label: 'Target Industries', description: 'Industries or product categories of interest.' },
  { key: 'constraints', label: 'Constraints', description: 'Limits or realities the planning system must respect.' },
  { key: 'workPreferences', label: 'Work Preferences', description: 'Preferred working style and product environment.' },
  { key: 'learningPreferences', label: 'Learning Preferences', description: 'How the user best learns and upskills.' },
  { key: 'keyStrengths', label: 'Key Strengths', description: 'Strength clusters worth leaning on.' },
  { key: 'riskSignals', label: 'Risk Signals', description: 'Risks that should be monitored explicitly.' },
  { key: 'portfolioLinks', label: 'Portfolio Links', description: 'URLs or references that support the profile.' },
];

export function buildProfileSnapshotSections(profile: ProfileRecord) {
  return [
    {
      title: 'Identity And Context',
      items: [
        { label: 'Display Name', value: profile.displayName },
        { label: 'Current Role', value: profile.currentRole },
        { label: 'Employment Status', value: profile.employmentStatus },
        { label: 'Location Region', value: profile.locationRegion },
        { label: 'Weekly Time Budget', value: profile.weeklyTimeBudget },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: 'Direction',
      items: [
        { label: 'Target Role', value: profile.targetRole },
        { label: 'Short-Term Goal', value: profile.shortTermGoal },
        { label: 'Long-Term Goal', value: profile.longTermGoal },
        { label: 'Target Industries', value: profile.targetIndustries },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: 'Strengths And Constraints',
      items: [
        { label: 'Key Strengths', value: profile.keyStrengths },
        { label: 'Constraints', value: profile.constraints },
        { label: 'Risk Signals', value: profile.riskSignals },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Work Preferences', value: profile.workPreferences },
        { label: 'Learning Preferences', value: profile.learningPreferences },
        { label: 'Portfolio Links', value: profile.portfolioLinks },
      ] satisfies ProfileSnapshotItem[],
    },
  ];
}
