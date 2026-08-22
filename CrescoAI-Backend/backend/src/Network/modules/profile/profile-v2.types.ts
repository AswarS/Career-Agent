export const PROFILE_V2_SCHEMA_VERSION = 'career_profile_v2' as const;

export type ProfileTimeScope = 'long_term' | 'short_term';
export type ProfilePriority =
  | 'hard_constraint'
  | 'high'
  | 'normal'
  | 'background';
export type ProfileMemoryStatus =
  | 'active'
  | 'superseded'
  | 'expired'
  | 'deleted';
export type ProfileProposalStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'expired';
export type ProfileProposalOperation =
  | 'create'
  | 'update'
  | 'supersede'
  | 'delete'
  | 'expire';
export type ProfileUpdateLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type ProfilePersistentLevel = Exclude<ProfileUpdateLevel, 'L0'>;
export type ProfileMemoryMutationOperation = 'add' | 'replace';
export type ProfilePolicyAction = 'ignore' | 'apply' | 'propose';
export type ProfileTargetType = 'base_profile' | 'memory';
export type ProfileSourceType =
  | 'user_ui'
  | 'user_explicit'
  | 'user_confirmed'
  | 'agent_summary'
  | 'multi_conversation_summary'
  | 'system_migration'
  | 'system_correction';

export interface EducationBackgroundItem {
  school: string;
  major: string;
  degree: string;
  graduationDate: string | null;
  description: string;
}

export interface BaseProfileRecord {
  schemaVersion: typeof PROFILE_V2_SCHEMA_VERSION;
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

export interface ProfileReadSnapshot {
  base: BaseProfileRecord;
  aggregateVersion: number;
}

export interface BaseProfilePatch {
  name?: string;
  gender?: string;
  birthDate?: string | null;
  educationLevel?: string;
  educationBackground?: EducationBackgroundItem[];
  currentCity?: string;
  currentStatus?: string;
  currentRole?: string;
  currentIndustry?: string;
  yearsOfExperience?: number | null;
  contactLanguage?: string;
}

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
  sourceType: ProfileSourceType;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  status: ProfileMemoryStatus;
  expiresAt: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileMemoryCandidate {
  operation?: ProfileMemoryMutationOperation;
  profileIndex?: string;
  expectedTargetId?: string;
  expectedTargetVersion?: number;
  content: string;
  category: string;
  level: ProfileUpdateLevel;
  slotKey?: string;
  appliesTo?: string[];
  timeScope?: ProfileTimeScope | 'temporary';
  priority?: ProfilePriority;
  sourceType?: ProfileSourceType;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  expiresAt?: string | null;
}

export interface ProfilePolicyDecision {
  level: ProfileUpdateLevel;
  action: ProfilePolicyAction;
  reasons: string[];
  conflictIds: string[];
  confirmationRequired: boolean;
}

export interface ProfileChangeProposalRecord {
  id: string;
  targetType: ProfileTargetType;
  operation: ProfileProposalOperation;
  candidate: Record<string, unknown>;
  currentValue: Record<string, unknown> | null;
  conflictIds: string[];
  rationale: string;
  updateLevel: ProfileUpdateLevel;
  confirmationRequired: boolean;
  status: ProfileProposalStatus;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  baseVersion: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ProfileContextRecord {
  version: number;
  queryIntent: string;
  baseFacts: Array<{ key: string; value: string }>;
  hardConstraints: ProfileMemoryRecord[];
  shortTerm: ProfileMemoryRecord[];
  longTerm: ProfileMemoryRecord[];
  rendered: string;
}

export interface ProfileMutationMeta {
  sourceType: ProfileSourceType;
  expectedVersion?: number;
  expectedAggregateVersion?: number;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  userConfirmed?: boolean;
  updateLevel?: ProfileUpdateLevel;
  actorType?: 'user' | 'agent' | 'system';
}

export interface ProfilePageRecord {
  baseProfile: BaseProfileRecord;
  memories: ProfileMemoryRecord[];
  proposals: ProfileChangeProposalRecord[];
  aggregateVersion: number;
  projectionVersion: number;
  projectionStatus: 'current' | 'pending' | 'failed';
}
