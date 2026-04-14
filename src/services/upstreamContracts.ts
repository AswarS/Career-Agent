import type {
  AgentAccent,
  ArtifactRecord,
  ArtifactRenderMode,
  ArtifactStatus,
  ArtifactViewMode,
  MessageAction,
  MessageMedia,
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
  actions?: UpstreamMessageAction[] | null;
  media?: UpstreamMessageMedia[] | null;
  attachments?: UpstreamMessageMedia[] | null;
  created_at?: string;
  createdAt?: string;
}

export interface UpstreamMessageAction {
  id: string;
  kind: string;
  label: string;
  artifact_id?: string;
  artifactId?: string;
  view_mode?: string | null;
  viewMode?: string | null;
}

export interface UpstreamMessageMedia {
  id?: string;
  kind?: string;
  type?: string;
  url?: string | null;
  src?: string | null;
  title?: string | null;
  caption?: string | null;
  alt?: string | null;
  mime_type?: string | null;
  mimeType?: string | null;
  poster_url?: string | null;
  posterUrl?: string | null;
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

function normalizeArtifactViewMode(value: string | null | undefined): ArtifactViewMode | undefined {
  if (value === 'focus' || value === 'immersive' || value === 'pane') {
    return value;
  }

  return undefined;
}

function normalizeMessageActions(actions: UpstreamMessageAction[] | null | undefined): MessageAction[] | undefined {
  const nextActions: MessageAction[] = [];

  for (const action of actions ?? []) {
    const artifactId = action.artifactId ?? action.artifact_id;

    if (!artifactId || (action.kind !== 'open-artifact' && action.kind !== 'open_artifact')) {
      continue;
    }

    const nextAction: MessageAction = {
      id: action.id,
      kind: 'open-artifact',
      label: action.label,
      artifactId,
    };

    const viewMode = normalizeArtifactViewMode(action.viewMode ?? action.view_mode);
    if (viewMode) {
      nextAction.viewMode = viewMode;
    }

    nextActions.push(nextAction);
  }

  return nextActions.length ? nextActions : undefined;
}

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function normalizeMediaUrl(value: string | null | undefined): string | null {
  const nextValue = value?.trim();

  if (!nextValue || nextValue.startsWith('//')) {
    return null;
  }

  if (!URL_SCHEME_PATTERN.test(nextValue)) {
    return nextValue;
  }

  try {
    const protocol = new URL(nextValue).protocol.toLowerCase();

    if (protocol === 'http:' || protocol === 'https:') {
      return nextValue;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const nextValue = value?.trim();
  return nextValue || undefined;
}

function normalizeMessageMedia(media: UpstreamMessageMedia[] | null | undefined): MessageMedia[] | undefined {
  const nextMedia: MessageMedia[] = [];

  for (const item of media ?? []) {
    const kind = item.kind ?? item.type;
    const url = normalizeMediaUrl(item.url ?? item.src);

    if ((kind !== 'image' && kind !== 'video') || !url) {
      continue;
    }

    nextMedia.push({
      id: item.id?.trim() || `media-${nextMedia.length + 1}`,
      kind,
      url,
      title: normalizeOptionalText(item.title),
      caption: normalizeOptionalText(item.caption),
      alt: normalizeOptionalText(item.alt),
      mimeType: normalizeOptionalText(item.mimeType ?? item.mime_type),
      posterUrl: normalizeMediaUrl(item.posterUrl ?? item.poster_url) ?? undefined,
    });
  }

  return nextMedia.length ? nextMedia : undefined;
}

function mergeMessageMediaSources(input: UpstreamThreadMessage): UpstreamMessageMedia[] {
  return [...input.media ?? [], ...input.attachments ?? []];
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
    actions: input.role === 'assistant' ? normalizeMessageActions(input.actions) : undefined,
    media: normalizeMessageMedia(mergeMessageMediaSources(input)),
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
