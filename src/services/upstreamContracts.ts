import type {
  ArtifactRecord,
  ArtifactRenderMode,
  ArtifactStatus,
  MessageKind,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadStatus,
  ThreadSummary,
} from '../types/entities';

export interface UpstreamThreadSummary {
  id: string;
  title: string;
  preview: string;
  status: ThreadStatus;
  updated_at?: string;
  updatedAt?: string;
}

export interface UpstreamThreadMessage {
  id: string;
  thread_id?: string;
  threadId?: string;
  role: ThreadMessage['role'];
  kind?: MessageKind;
  content: string;
  created_at?: string;
  createdAt?: string;
}

export interface UpstreamProfileSuggestion {
  id: string;
  title: string;
  rationale: string;
  source_thread_id?: string | null;
  sourceThreadId?: string | null;
  patch: Partial<ProfileRecord>;
}

export interface UpstreamArtifactRecord {
  id: string;
  type: ArtifactRecord['type'];
  title: string;
  status: ArtifactStatus | 'queued' | 'failed';
  render_mode?: ArtifactRenderMode;
  renderMode?: ArtifactRenderMode;
  revision: number;
  updated_at?: string;
  updatedAt?: string;
  summary: string;
  payload: ArtifactRecord['payload'];
}

function normalizeArtifactStatus(value: UpstreamArtifactRecord['status']): ArtifactStatus {
  if (value === 'queued') {
    return 'loading';
  }

  if (value === 'failed') {
    return 'error';
  }

  return value;
}

function normalizeArtifactRenderMode(value: ArtifactRenderMode | undefined): ArtifactRenderMode {
  return value === 'cards' || value === 'markdown' ? value : 'html';
}

function normalizeMessageKind(value: MessageKind | undefined): MessageKind {
  return value === 'status' ? 'status' : 'markdown';
}

export function sanitizeProfileRecord(input: ProfileRecord): ProfileRecord {
  return {
    ...input,
    targetIndustries: [...input.targetIndustries],
    constraints: [...input.constraints],
    workPreferences: [...input.workPreferences],
    learningPreferences: [...input.learningPreferences],
    keyStrengths: [...input.keyStrengths],
    riskSignals: [...input.riskSignals],
    portfolioLinks: [...input.portfolioLinks],
  };
}

export function normalizeThreadSummary(input: UpstreamThreadSummary): ThreadSummary {
  return {
    id: input.id,
    title: input.title,
    preview: input.preview,
    updatedAt: input.updatedAt ?? input.updated_at ?? new Date(0).toISOString(),
    status: input.status,
  };
}

export function normalizeThreadMessage(input: UpstreamThreadMessage, fallbackThreadId: string): ThreadMessage {
  return {
    id: input.id,
    threadId: input.threadId ?? input.thread_id ?? fallbackThreadId,
    role: input.role,
    kind: normalizeMessageKind(input.kind),
    content: input.content,
    createdAt: input.createdAt ?? input.created_at ?? new Date(0).toISOString(),
  };
}

export function normalizeProfileSuggestion(input: UpstreamProfileSuggestion): ProfileSuggestion {
  const patch = { ...input.patch };

  if (patch.targetIndustries) {
    patch.targetIndustries = [...patch.targetIndustries];
  }

  if (patch.constraints) {
    patch.constraints = [...patch.constraints];
  }

  if (patch.workPreferences) {
    patch.workPreferences = [...patch.workPreferences];
  }

  if (patch.learningPreferences) {
    patch.learningPreferences = [...patch.learningPreferences];
  }

  if (patch.keyStrengths) {
    patch.keyStrengths = [...patch.keyStrengths];
  }

  if (patch.riskSignals) {
    patch.riskSignals = [...patch.riskSignals];
  }

  if (patch.portfolioLinks) {
    patch.portfolioLinks = [...patch.portfolioLinks];
  }

  return {
    id: input.id,
    title: input.title,
    rationale: input.rationale,
    sourceThreadId: input.sourceThreadId ?? input.source_thread_id ?? null,
    patch,
  };
}

export function normalizeArtifactRecord(input: UpstreamArtifactRecord): ArtifactRecord {
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    status: normalizeArtifactStatus(input.status),
    renderMode: normalizeArtifactRenderMode(input.renderMode ?? input.render_mode),
    revision: input.revision,
    updatedAt: input.updatedAt ?? input.updated_at ?? new Date(0).toISOString(),
    summary: input.summary,
    payload: {
      ...input.payload,
    },
  };
}
