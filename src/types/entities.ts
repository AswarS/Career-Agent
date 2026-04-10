export type ThreadStatus = 'active' | 'archived';

export interface ThreadSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  status: ThreadStatus;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageKind = 'markdown' | 'status';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type AgentAccent = 'teal' | 'amber' | 'blue' | 'slate';

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  reasoning?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  agentAccent?: AgentAccent | null;
  createdAt: string;
}

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

export interface ProfileSuggestion {
  id: string;
  title: string;
  rationale: string;
  sourceThreadId: string | null;
  patch: Partial<ProfileRecord>;
}

export type ArtifactType = 'weekly-plan' | 'profile-summary' | 'career-roadmap';
export type ArtifactStatus = 'idle' | 'loading' | 'streaming' | 'ready' | 'stale' | 'error';
export type ArtifactRenderMode = 'html' | 'markdown' | 'cards' | 'url';
export type ArtifactViewMode = 'pane' | 'focus' | 'immersive';

interface ArtifactRecordBase {
  id: string;
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  revision: number;
  updatedAt: string;
  summary: string;
}

export interface HtmlArtifactRecord extends ArtifactRecordBase {
  renderMode: 'html';
  payload: {
    html: string;
  };
}

export interface UrlArtifactRecord extends ArtifactRecordBase {
  renderMode: 'url';
  payload: {
    url: string;
  };
}

export interface MarkdownArtifactRecord extends ArtifactRecordBase {
  renderMode: 'markdown';
  payload: {
    markdown: string;
  };
}

export interface CardsArtifactRecord extends ArtifactRecordBase {
  renderMode: 'cards';
  payload: {
    cards: unknown[];
  };
}

export type ArtifactRecord =
  | HtmlArtifactRecord
  | UrlArtifactRecord
  | MarkdownArtifactRecord
  | CardsArtifactRecord;

export type ArtifactPayload = ArtifactRecord['payload'];
