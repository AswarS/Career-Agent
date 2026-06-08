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
  { key: 'displayName', label: '展示名称', input: 'text', description: '用户在工作台中的显示名称。' },
  { key: 'locale', label: '语言区域', input: 'text', description: '偏好的语言和格式区域设置。' },
  { key: 'timezone', label: '时区', input: 'text', description: '计划与提醒使用的主要时区。' },
  { key: 'currentRole', label: '当前角色', input: 'text', description: '当前的工作身份或状态定位。' },
  { key: 'employmentStatus', label: '就业状态', input: 'text', description: '当前工作或求职背景。' },
  { key: 'locationRegion', label: '所在地区', input: 'text', description: '地区与远程协作偏好背景。' },
  { key: 'weeklyTimeBudget', label: '每周可投入时间', input: 'text', description: '可用于职业推进的专注时间。' },
  { key: 'targetRole', label: '目标角色', input: 'text', description: '下一阶段希望发展的岗位或方向。' },
  { key: 'shortTermGoal', label: '短期目标', input: 'textarea', description: '近期需要完成的执行目标。' },
  { key: 'longTermGoal', label: '长期目标', input: 'textarea', description: '更长期的发展方向。' },
  { key: 'experienceSummary', label: '经验概述', input: 'textarea', description: '对过往经历与优势的简要总结。' },
  { key: 'educationSummary', label: '学习背景', input: 'textarea', description: '正式教育与自我学习情况。' },
];

export const listProfileFields: ListProfileFieldConfig[] = [
  { key: 'targetIndustries', label: '目标行业', description: '感兴趣的行业或产品方向。' },
  { key: 'constraints', label: '约束条件', description: '规划系统必须尊重的现实限制。' },
  { key: 'workPreferences', label: '工作偏好', description: '偏好的工作方式与产品环境。' },
  { key: 'learningPreferences', label: '学习偏好', description: '最适合自己的学习与提升方式。' },
  { key: 'keyStrengths', label: '核心优势', description: '值得持续放大的能力组合。' },
  { key: 'riskSignals', label: '风险信号', description: '需要被显式关注的风险项。' },
  { key: 'portfolioLinks', label: '作品链接', description: '支持画像判断的网址或资料引用。' },
];

export function buildProfileSnapshotSections(profile: ProfileRecord) {
  return [
    {
      title: '身份与背景',
      items: [
        { label: '展示名称', value: profile.displayName },
        { label: '当前角色', value: profile.currentRole },
        { label: '就业状态', value: profile.employmentStatus },
        { label: '所在地区', value: profile.locationRegion },
        { label: '每周可投入时间', value: profile.weeklyTimeBudget },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: '发展方向',
      items: [
        { label: '目标角色', value: profile.targetRole },
        { label: '短期目标', value: profile.shortTermGoal },
        { label: '长期目标', value: profile.longTermGoal },
        { label: '目标行业', value: profile.targetIndustries },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: '优势与约束',
      items: [
        { label: '核心优势', value: profile.keyStrengths },
        { label: '约束条件', value: profile.constraints },
        { label: '风险信号', value: profile.riskSignals },
      ] satisfies ProfileSnapshotItem[],
    },
    {
      title: '偏好设置',
      items: [
        { label: '工作偏好', value: profile.workPreferences },
        { label: '学习偏好', value: profile.learningPreferences },
        { label: '作品链接', value: profile.portfolioLinks },
      ] satisfies ProfileSnapshotItem[],
    },
  ];
}
