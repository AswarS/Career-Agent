export type ProfileTimeScope = 'long_term' | 'short_term';
export type ProfilePriority = 'hard_constraint' | 'high' | 'normal' | 'background';
export type ProfileMemoryStatus = 'active' | 'superseded' | 'expired' | 'deleted';
export type ProfilePersistentLevel = 'L1' | 'L2' | 'L3';
export type ProfileProposalStatus = 'pending' | 'applied' | 'rejected' | 'expired';

export interface EducationBackgroundItem {
  school: string;
  major: string;
  degree: string;
  graduationDate: string | null;
  description: string;
}

export interface BaseProfileRecord {
  schemaVersion: 'career_profile_v2';
  userId: number;
  name: string;
  gender: string;
  birthDate: string | null;
  age: number | null;
  educationLevel: string;
  educationBackground: EducationBackgroundItem[];
  currentCity: string;
  currentStatus: string;
  currentRole: string;
  currentIndustry: string;
  yearsOfExperience: number | null;
  contactLanguage: string;
  version: number;
  missingRequiredFields: string[];
  createdAt: string;
  updatedAt: string;
}

export type BaseProfilePatch = Partial<Pick<
  BaseProfileRecord,
  | 'name'
  | 'gender'
  | 'birthDate'
  | 'educationLevel'
  | 'educationBackground'
  | 'currentCity'
  | 'currentStatus'
  | 'currentRole'
  | 'currentIndustry'
  | 'yearsOfExperience'
  | 'contactLanguage'
>>;

export interface ProfileMemoryRecord {
  id: string;
  profileIndex: string;
  profileLevel: ProfilePersistentLevel;
  itemVersion: number;
  content: string;
  category: string;
  slotKey: string;
  appliesTo: string[];
  timeScope: ProfileTimeScope;
  priority: ProfilePriority;
  sourceType: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  status: ProfileMemoryStatus;
  expiresAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileChangeProposalRecord {
  id: string;
  targetType: 'base_profile' | 'memory';
  operation: 'create' | 'update' | 'supersede' | 'delete' | 'expire';
  candidate: Record<string, unknown>;
  currentValue: Record<string, unknown> | null;
  conflictIds: string[];
  rationale: string;
  updateLevel: 'L0' | 'L1' | 'L2' | 'L3';
  confirmationRequired: boolean;
  status: ProfileProposalStatus;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  baseVersion: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ProfileRevisionRecord {
  id: number;
  aggregateVersion: number;
  targetType: string;
  targetId: string | null;
  operation: string;
  sourceType: string;
  updateLevel: string;
  sourceConversationId: string | null;
  userConfirmed: boolean;
  actorType: string;
  createdAt: string;
}

export interface ProfileStateRecord {
  aggregateVersion: number;
  projectionVersion: number;
  projectionStatus: 'current' | 'pending' | 'failed';
}

export type CreateProfileMemoryInput = Pick<
  ProfileMemoryRecord,
  'content' | 'category' | 'timeScope' | 'priority' | 'profileLevel'
> & Partial<Pick<ProfileMemoryRecord, 'slotKey' | 'appliesTo' | 'expiresAt'>>;

export type ReplaceProfileMemoryInput = Pick<
  ProfileMemoryRecord,
  'content' | 'profileLevel'
> & Partial<Pick<
  ProfileMemoryRecord,
  'category' | 'slotKey' | 'appliesTo' | 'timeScope' | 'priority' | 'expiresAt'
>>;
