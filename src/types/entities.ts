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
export type ArtifactStatus = 'idle' | 'loading' | 'streaming' | 'ready' | 'stale' | 'error';
export type ArtifactRenderMode = 'html' | 'markdown' | 'cards' | 'url';
export type ArtifactViewMode = 'pane' | 'focus' | 'immersive';
export type MessageActionKind = 'open-artifact';
export type MessageMediaKind = 'image' | 'video';
export type DraftMessageAttachmentKind = 'image' | 'file';

export interface MessageAction {
  id: string;
  kind: MessageActionKind;
  label: string;
  artifactId: string;
  viewMode?: ArtifactViewMode;
}

export interface MessageMedia {
  id: string;
  kind: MessageMediaKind;
  url: string;
  title?: string;
  caption?: string;
  alt?: string;
  mimeType?: string;
  posterUrl?: string;
}

export interface MessageFileAttachment {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface DraftMessageAttachment {
  id: string;
  kind: DraftMessageAttachmentKind;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DraftMessageSubmission {
  content: string;
  attachments: DraftMessageAttachment[];
}

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
  actions?: MessageAction[];
  media?: MessageMedia[];
  files?: MessageFileAttachment[];
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

export type ArtifactType =
  | 'weekly-plan'
  | 'profile-summary'
  | 'career-roadmap'
  | 'mock-interview'
  | 'coding-assessment'
  | 'visual-learning'
  | 'app-example';

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
    allowScripts?: boolean;
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
