import type {
  AgentAccent,
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
  reasoning?: string | null;
  think?: string | null;
  agent_id?: string | null;
  agentId?: string | null;
  agent_name?: string | null;
  agentName?: string | null;
  agent_accent?: AgentAccent | null;
  agentAccent?: AgentAccent | null;
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
  payload: {
    html?: string | null;
    url?: string | null;
    markdown?: string | null;
    cards?: unknown[] | null;
  };
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
  return value === 'cards' || value === 'markdown' || value === 'url' ? value : 'html';
}

function normalizeMessageKind(value: MessageKind | undefined): MessageKind {
  return value === 'status' ? 'status' : 'markdown';
}

function normalizeAgentAccent(value: AgentAccent | undefined | null): AgentAccent | null {
  if (value === 'amber' || value === 'blue' || value === 'slate' || value === 'teal') {
    return value;
  }

  return null;
}

function extractReasoningBlock(content: string): { content: string; reasoning: string | null } {
  const matches = [...content.matchAll(/<think>([\s\S]*?)<\/think>/gi)];

  if (matches.length === 0) {
    return {
      content,
      reasoning: null,
    };
  }

  const reasoning = matches
    .map((match) => match[1]?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .join('\n\n');

  const nextContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return {
    content: nextContent,
    reasoning: reasoning || null,
  };
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
  const shouldExtractInlineReasoning = input.role === 'assistant' && !input.reasoning && !input.think;
  const extractedReasoning = shouldExtractInlineReasoning
    ? extractReasoningBlock(input.content)
    : { content: input.content, reasoning: null };

  return {
    id: input.id,
    threadId: input.threadId ?? input.thread_id ?? fallbackThreadId,
    role: input.role,
    kind: normalizeMessageKind(input.kind),
    content: extractedReasoning.content,
    reasoning: input.reasoning ?? input.think ?? extractedReasoning.reasoning,
    agentId: input.agentId ?? input.agent_id ?? null,
    agentName: input.agentName ?? input.agent_name ?? null,
    agentAccent: normalizeAgentAccent(input.agentAccent ?? input.agent_accent),
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
  const renderMode = normalizeArtifactRenderMode(input.renderMode ?? input.render_mode);
  const baseRecord = {
    id: input.id,
    type: input.type,
    title: input.title,
    status: normalizeArtifactStatus(input.status),
    revision: input.revision,
    updatedAt: input.updatedAt ?? input.updated_at ?? new Date(0).toISOString(),
    summary: input.summary,
  };

  if (renderMode === 'url') {
    return {
      ...baseRecord,
      renderMode,
      payload: {
        url: input.payload.url?.trim() ?? '',
      },
    };
  }

  if (renderMode === 'markdown') {
    return {
      ...baseRecord,
      renderMode,
      payload: {
        markdown: input.payload.markdown?.trim() ?? '',
      },
    };
  }

  if (renderMode === 'cards') {
    return {
      ...baseRecord,
      renderMode,
      payload: {
        cards: Array.isArray(input.payload.cards) ? [...input.payload.cards] : [],
      },
    };
  }

  return {
    ...baseRecord,
    renderMode,
    payload: {
      html: input.payload.html ?? '',
    },
  };
}
