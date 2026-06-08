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
export type MessageMediaKind = 'image' | 'video' | 'html' | 'app' | 'file';
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

export interface UploadedConversationFile {
  assetId: string;
  kind: 'image' | 'video' | 'file';
  url: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  storagePath: string;
  storedFileName: string;
  originalName: string;
}

export interface SendThreadMessageInput {
  kind?: MessageKind;
  content: string;
  attachmentAssetIds?: string[];
  clientRequestId?: string;
  context?: Record<string, unknown>;
}

export interface SendThreadMessageResult {
  accepted: boolean;
  messageId: string;
  assistantMessageId: string;
  status: 'queued' | 'processing' | 'done' | 'failed' | string;
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

export interface AuthUser {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string | null;
  expiresIn: number | null;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface RegisterCredentials {
  email?: string;
  username?: string;
  displayName: string;
  password: string;
}

export interface AccountSetting {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApiSetting {
  id: string;
  userId: string;
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  apiKeyFingerprint: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  imageUrl?: string | null;
  hasImageKey?: boolean;
  imageKeyHint?: string | null;
  imageDefaultModel?: string | null;
  imageModels?: string[];
  videoUrl?: string | null;
  hasVideoKey?: boolean;
  videoKeyHint?: string | null;
  videoDefaultModel?: string | null;
  videoModels?: string[];
}

export interface UserSettings {
  account: AccountSetting;
  apiSettings: ApiSetting[];
}

export interface UpdateUsernameInput {
  username: string;
  displayName?: string;
}

export interface UpsertApiSettingInput {
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  imageUrl?: string;
  imageKey?: string;
  imageDefaultModel?: string;
  imageModels?: string;
  videoUrl?: string;
  videoKey?: string;
  videoDefaultModel?: string;
  videoModels?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  status: number | null;
  message: string;
}
