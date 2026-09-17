import type {
  AskQuestion,
  MessageAction,
  MessageBlock,
  MessageBlockType,
  MessageFileAttachment,
  MessageMedia,
  ThreadMessage,
} from '../../types/entities';
import { formatMessageFileSize, formatMessageFileType } from './attachmentPresentation';
import { getPresentedMessageContent } from './messagePresentation';
import { normalizeMessageBlocks } from './messageBlockNormalization';

export interface MessageMediaView extends MessageMedia {
  altText: string;
}

export interface MessageFileAttachmentView extends MessageFileAttachment {
  canDownload: boolean;
  displayType: string;
  displaySize: string;
}

export interface MessageBlockView {
  id: string;
  type: MessageBlockType;
  title: string | null;
  text: string;
  name?: string | null;
  status?: string | null;
  toolUseId?: string | null;
  isError?: boolean;
  questions?: AskQuestion[];
  answers?: Record<string, string>;
  media: MessageMediaView[];
  files: MessageFileAttachmentView[];
  actions: MessageAction[];
  resultBlocks?: MessageBlockView[];
  hasResultBlocks?: boolean;
}

export interface MessageReplyUnitView {
  id: string;
  textBlock: MessageBlockView | null;
  executionBlocks: MessageBlockView[];
  standaloneToolResultBlocks: MessageBlockView[];
  artifactBlocks: MessageBlockView[];
  askQuestionBlocks: MessageBlockView[];
  hasHiddenExecutionBlocks: boolean;
  hiddenExecutionBlockCount: number;
  pending: boolean;
}

export interface MessageViewModel {
  message: ThreadMessage;
  id: string;
  role: ThreadMessage['role'];
  kind: ThreadMessage['kind'];
  content: string;
  createdAt: string;
  showSpeakerIdentity: boolean;
  speakerName: string;
  speakerMeta: string | null;
  runtimeMetaLabel: string | null;
  accentClass: string | null;
  blocks: MessageBlockView[];
  replyUnits: MessageReplyUnitView[];
  textReplyUnitCount: number;
  finalBlocks: MessageBlockView[];
  textBlocks: MessageBlockView[];
  artifactBlocks: MessageBlockView[];
  askQuestionBlocks: MessageBlockView[];
  executionBlocks: MessageBlockView[];
  standaloneToolResultBlocks: MessageBlockView[];
  hasHiddenExecutionBlocks: boolean;
  hiddenExecutionBlockCount: number;
  streaming: boolean;
}

export interface CreateMessageViewModelOptions {
  multiAgentMode?: boolean;
}

const legacyReasoningMarkerPattern = /^\[(工具调用|工具调用已过滤|工具返回|工具返回已过滤|过程事件|结构化过程事件已过滤|tool[_ -]?call|tool[_ -]?result|process event|宸ゅ叿璋冪敤|宸ゅ叿杩斿洖|杩囩▼浜嬩欢)\]\s*$/gim;

export function createMessageViewModel(
  message: ThreadMessage,
  options: CreateMessageViewModelOptions = {},
): MessageViewModel {
  const multiAgentMode = Boolean(options.multiAgentMode);
  const presentedMessage = getPresentedMessageContent(message);
  const blocks = createMessageBlockViews(message, presentedMessage);
  const streaming = Boolean(message.streaming);
  const blockGroups = createMessageBlockGroups(blocks, streaming);

  return {
    message,
    id: message.id,
    role: message.role,
    kind: message.kind,
    content: presentedMessage.content,
    createdAt: message.createdAt,
    showSpeakerIdentity: message.role !== 'user',
    speakerName: formatSpeakerName(message, multiAgentMode),
    speakerMeta: formatSpeakerMeta(message, multiAgentMode),
    runtimeMetaLabel: formatRuntimeMeta(message),
    accentClass: formatAgentAccentClass(message, multiAgentMode),
    blocks,
    replyUnits: blockGroups.replyUnits,
    textReplyUnitCount: blockGroups.replyUnits.filter((unit) => unit.textBlock).length,
    finalBlocks: blockGroups.finalBlocks,
    textBlocks: blockGroups.textBlocks,
    artifactBlocks: blockGroups.artifactBlocks,
    askQuestionBlocks: blockGroups.askQuestionBlocks,
    executionBlocks: blockGroups.executionBlocks,
    standaloneToolResultBlocks: blockGroups.standaloneToolResultBlocks,
    hasHiddenExecutionBlocks: blockGroups.hasHiddenExecutionBlocks,
    hiddenExecutionBlockCount: blockGroups.hiddenExecutionBlockCount,
    streaming,
  };
}

function createMessageBlockViews(
  message: ThreadMessage,
  presentedMessage: { content: string; reasoning: string | null },
): MessageBlockView[] {
  const sourceBlocks = message.blocks?.length
    ? message.blocks
    : createFallbackBlocks(message, presentedMessage);
  const canonicalBlocks = normalizeMessageBlocks(sourceBlocks, {
    authoritativeText: message.role === 'assistant'
      ? presentedMessage.content
      : undefined,
  }) ?? [];
  const normalizedBlocks = canonicalBlocks
    .map(toBlockView)
    .filter((block): block is MessageBlockView => Boolean(block));
  const withArtifactBlock = appendArtifactBlockIfNeeded(
    normalizedBlocks,
    message.media ?? [],
    message.files ?? [],
    message.role === 'assistant' ? message.actions ?? [] : [],
  );
  const fallbackText = presentedMessage.content.trim();

  if (withArtifactBlock.length) {
    if (withArtifactBlock.some((block) => block.type === 'text') || !fallbackText) {
      return withArtifactBlock;
    }
    const finalTextBlock = toBlockView({
      id: 'final-text-0',
      type: 'text',
      text: fallbackText,
    })!;
    const artifactIndex = withArtifactBlock.findIndex((block) => block.type === 'artifact');
    return artifactIndex < 0
      ? [...withArtifactBlock, finalTextBlock]
      : [
          ...withArtifactBlock.slice(0, artifactIndex),
          finalTextBlock,
          ...withArtifactBlock.slice(artifactIndex),
        ];
  }

  return fallbackText
    ? [toBlockView({ id: 'text-0', type: 'text', text: fallbackText })!]
    : [];
}

function createExecutionBlockGroup(blocks: MessageBlockView[]) {
  const toolCallIds = new Set(
    blocks
      .filter((block) => block.type === 'tool_call' && block.toolUseId)
      .map((block) => block.toolUseId)
      .filter((toolUseId): toolUseId is string => Boolean(toolUseId)),
  );
  const toolResultsByUseId = new Map<string, MessageBlockView[]>();
  const standaloneToolResultBlocks: MessageBlockView[] = [];

  for (const block of blocks) {
    if (block.type !== 'tool_result') {
      continue;
    }

    if (block.toolUseId && toolCallIds.has(block.toolUseId)) {
      toolResultsByUseId.set(block.toolUseId, [
        ...(toolResultsByUseId.get(block.toolUseId) ?? []),
        block,
      ]);
      continue;
    }

    standaloneToolResultBlocks.push(block);
  }

  const executionBlocks = blocks
    .filter((block) => block.type === 'status' || block.type === 'tool_call')
    .map((block) => {
      if (block.type !== 'tool_call') {
        return block;
      }

      const resultBlocks = block.toolUseId
        ? toolResultsByUseId.get(block.toolUseId) ?? []
        : [];

      return {
        ...block,
        resultBlocks,
        hasResultBlocks: resultBlocks.length > 0,
      };
    });
  const hiddenExecutionBlockCount = executionBlocks.length + standaloneToolResultBlocks.length;

  return {
    executionBlocks,
    standaloneToolResultBlocks,
    hasHiddenExecutionBlocks: hiddenExecutionBlockCount > 0,
    hiddenExecutionBlockCount,
  };
}

function createMessageBlockGroups(blocks: MessageBlockView[], streaming: boolean) {
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const artifactBlocks = blocks.filter((block) => block.type === 'artifact');
  const askQuestionBlocks = blocks.filter((block) => block.type === 'ask_question');
  const processBlocks = blocks.filter((block) => (
    block.type !== 'text' && block.type !== 'artifact' && block.type !== 'ask_question'
  ));
  const finalBlocks = [...textBlocks, ...artifactBlocks, ...askQuestionBlocks];
  const executionGroup = createExecutionBlockGroup(processBlocks);
  const replySegments: Array<{
    textBlock: MessageBlockView | null;
    processBlocks: MessageBlockView[];
    askQuestionBlocks: MessageBlockView[];
  }> = [];
  let pendingProcessBlocks: MessageBlockView[] = [];
  let currentSegment: {
    textBlock: MessageBlockView | null;
    processBlocks: MessageBlockView[];
    askQuestionBlocks: MessageBlockView[];
  } | null = null;

  for (const block of blocks) {
    if (block.type === 'artifact') {
      continue;
    }

    if (block.type === 'ask_question') {
      if (!currentSegment) {
        currentSegment = {
          textBlock: null,
          processBlocks: pendingProcessBlocks,
          askQuestionBlocks: [],
        };
        replySegments.push(currentSegment);
        pendingProcessBlocks = [];
      }
      currentSegment.askQuestionBlocks.push(block);
      continue;
    }

    if (block.type !== 'text') {
      pendingProcessBlocks.push(block);
      continue;
    }

    currentSegment = {
      textBlock: block,
      processBlocks: pendingProcessBlocks,
      askQuestionBlocks: [],
    };
    replySegments.push(currentSegment);
    pendingProcessBlocks = [];
  }

  if (!streaming && pendingProcessBlocks.length && currentSegment) {
    currentSegment.processBlocks.push(...pendingProcessBlocks);
    pendingProcessBlocks = [];
  }

  const replyUnits: MessageReplyUnitView[] = replySegments.map((segment, index) => {
    const unitExecutionGroup = createExecutionBlockGroup(segment.processBlocks);
    return {
      id: `reply-${segment.textBlock?.id ?? `interactive-${index}`}`,
      textBlock: segment.textBlock,
      executionBlocks: unitExecutionGroup.executionBlocks,
      standaloneToolResultBlocks: unitExecutionGroup.standaloneToolResultBlocks,
      artifactBlocks: index === replySegments.length - 1 ? artifactBlocks : [],
      askQuestionBlocks: segment.askQuestionBlocks,
      hasHiddenExecutionBlocks: unitExecutionGroup.hasHiddenExecutionBlocks,
      hiddenExecutionBlockCount: unitExecutionGroup.hiddenExecutionBlockCount,
      pending: false,
    };
  });

  if (pendingProcessBlocks.length) {
    const pendingExecutionGroup = createExecutionBlockGroup(pendingProcessBlocks);
    replyUnits.push({
      id: 'reply-pending-execution',
      textBlock: null,
      executionBlocks: pendingExecutionGroup.executionBlocks,
      standaloneToolResultBlocks: pendingExecutionGroup.standaloneToolResultBlocks,
      artifactBlocks: replySegments.length ? [] : artifactBlocks,
      askQuestionBlocks: [],
      hasHiddenExecutionBlocks: pendingExecutionGroup.hasHiddenExecutionBlocks,
      hiddenExecutionBlockCount: pendingExecutionGroup.hiddenExecutionBlockCount,
      pending: streaming,
    });
  }

  if (!replyUnits.length && (artifactBlocks.length || askQuestionBlocks.length)) {
    replyUnits.push({
      id: 'reply-artifacts',
      textBlock: null,
      executionBlocks: [],
      standaloneToolResultBlocks: [],
      artifactBlocks,
      askQuestionBlocks: askQuestionBlocks,
      hasHiddenExecutionBlocks: false,
      hiddenExecutionBlockCount: 0,
      pending: false,
    });
  }

  return {
    finalBlocks,
    textBlocks,
    artifactBlocks,
    askQuestionBlocks,
    replyUnits,
    ...executionGroup,
  };
}

function createFallbackBlocks(
  message: ThreadMessage,
  presentedMessage: { content: string; reasoning: string | null },
): MessageBlock[] {
  const blocks: MessageBlock[] = [];

  if (message.role === 'assistant' && presentedMessage.reasoning) {
    blocks.push(...createBlocksFromLegacyReasoning(presentedMessage.reasoning));
  }

  const content = presentedMessage.content.trim();
  if (content) {
    blocks.push({
      id: 'text-0',
      type: 'text',
      text: content,
    });
  }

  return blocks;
}

export function createBlocksFromLegacyReasoning(source: string | null | undefined): MessageBlock[] {
  const text = source?.trim();
  if (!text) {
    return [];
  }

  const matches = [...text.matchAll(legacyReasoningMarkerPattern)];
  if (!matches.length) {
    return [{
      id: 'status-0',
      type: 'status',
      title: '思考',
      text,
    }];
  }

  const blocks: MessageBlock[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    const matchIndex = match.index ?? 0;
    const statusText = text.slice(cursor, matchIndex).trim();
    if (statusText) {
      blocks.push({
        id: `status-${blocks.length}`,
        type: 'status',
        title: '思考',
        text: statusText,
      });
    }

    const marker = match[1] ?? '';
    const contentStart = matchIndex + match[0].length;
    const nextIndex = matches[index + 1]?.index ?? text.length;
    const content = text.slice(contentStart, nextIndex).trim();
    blocks.push(createLegacyMarkedBlock(marker, content, blocks.length));
    cursor = nextIndex;
  });

  const trailing = text.slice(cursor).trim();
  if (trailing) {
    blocks.push({
      id: `status-${blocks.length}`,
      type: 'status',
      title: '思考',
      text: trailing,
    });
  }

  return blocks;
}

function createLegacyMarkedBlock(marker: string, content: string, index: number): MessageBlock {
  if (/工具调用|tool[_ -]?call|宸ゅ叿璋冪敤/i.test(marker)) {
    return {
      id: `tool-call-${index}`,
      type: 'tool_call',
      title: '工具调用',
      text: '正在调用工具。',
    };
  }

  if (/工具返回|tool[_ -]?result|宸ゅ叿杩斿洖/i.test(marker)) {
    return {
      id: `tool-result-${index}`,
      type: 'tool_result',
      title: '工具返回',
      text: cleanPublicBlockText(content) || '工具已返回。',
    };
  }

  return {
    id: `status-${index}`,
    type: 'status',
    title: '思考',
    text: cleanPublicBlockText(content) || '正在处理过程事件。',
  };
}

function toBlockView(block: MessageBlock): MessageBlockView | null {
  const title = block.title ?? defaultBlockTitle(block);
  const text = cleanPublicBlockText(block.text ?? defaultBlockText(block));

  if (block.type === 'text' && !text) {
    return null;
  }

  return {
    id: block.id,
    type: block.type,
    title,
    text,
    name: block.name,
    status: block.status,
    toolUseId: block.toolUseId,
    isError: block.isError,
    questions: block.questions,
    answers: block.answers,
    media: (block.media ?? []).map(toMediaView),
    files: (block.files ?? []).map(toFileView),
    actions: block.actions ?? [],
  };
}

function appendArtifactBlockIfNeeded(
  blocks: MessageBlockView[],
  media: MessageMedia[],
  files: MessageFileAttachment[],
  actions: MessageAction[],
) {
  if (!media.length && !files.length && !actions.length) {
    return blocks;
  }

  const artifactIndex = blocks.findIndex((block) => block.type === 'artifact');
  if (artifactIndex >= 0) {
    const nextBlocks = [...blocks];
    nextBlocks[artifactIndex] = {
      ...nextBlocks[artifactIndex],
      media: mergeById(nextBlocks[artifactIndex].media, media.map(toMediaView)),
      files: mergeById(nextBlocks[artifactIndex].files, files.map(toFileView)),
      actions: mergeById(nextBlocks[artifactIndex].actions, actions),
    };
    return nextBlocks;
  }

  return [
    ...blocks,
    {
      id: 'artifact-0',
      type: 'artifact' as const,
      title: media.length || files.length ? '生成内容' : null,
      text: media.length || files.length ? '已生成可打开或下载的内容。' : '',
      media: media.map(toMediaView),
      files: files.map(toFileView),
      actions,
    },
  ];
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]) {
  const map = new Map<string, T>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, {
      ...map.get(item.id),
      ...item,
    });
  }
  return [...map.values()];
}

function defaultBlockTitle(block: MessageBlock) {
  if (block.type === 'tool_call') {
    return block.name ? `工具调用 · ${block.name}` : '工具调用';
  }
  if (block.type === 'tool_result') {
    return block.name ? `工具返回 · ${block.name}` : '工具返回';
  }
  if (block.type === 'skill') {
    return block.name ? `Skill · /${block.name}` : 'Skill';
  }
  if (block.type === 'artifact') {
    return '生成内容';
  }
  if (block.type === 'ask_question') {
    return '需要你的选择';
  }
  if (block.type === 'status') {
    return '思考';
  }
  return null;
}

function defaultBlockText(block: MessageBlock) {
  if (block.type === 'tool_call') {
    return block.name ? `正在调用 ${block.name}。` : '正在调用工具。';
  }
  if (block.type === 'tool_result') {
    return block.isError ? '工具返回错误。' : '工具已返回。';
  }
  if (block.type === 'skill') {
    return block.status ? `状态：${block.status}` : '';
  }
  if (block.type === 'ask_question') {
    return '请回答以下问题，以便继续。';
  }
  return '';
}

function cleanPublicBlockText(content: string) {
  return content
    .replace(/\[(?:工具调用已过滤|工具返回已过滤|结构化过程事件已过滤)\]/g, '')
    .replace(/\[(?:JWT|密钥|长密钥或哈希|长密钥或编码内容)已过滤\]/g, '******')
    .replace(/\[已过滤\]/g, '******')
    .split(/\r?\n/)
    .filter((line) => !/(已隐藏|已过滤|已脱敏|脱敏|过滤内容|filtered fields|hidden|redacted)/i.test(line))
    .join('\n')
    .trim();
}

function toMediaView(media: MessageMedia): MessageMediaView {
  const fallbacks: Record<MessageMedia['kind'], string> = {
    image: '对话图片',
    audio: '对话音频',
    video: '对话视频',
    html: '网页预览',
    app: '应用预览',
    file: '文件',
  };

  return {
    ...media,
    altText: media.alt ?? media.title ?? fallbacks[media.kind] ?? media.kind,
  };
}

function toFileView(file: MessageFileAttachment): MessageFileAttachmentView {
  return {
    ...file,
    canDownload: canDownloadFile(file.url),
    displayType: formatMessageFileType(file.mimeType),
    displaySize: formatMessageFileSize(file.sizeBytes),
  };
}

export function canDownloadFile(value: string) {
  const nextValue = value.trim();

  if (!nextValue || nextValue.startsWith('//')) {
    return false;
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(nextValue)) {
    return true;
  }

  try {
    const protocol = new URL(nextValue).protocol.toLowerCase();
    if (protocol === 'blob:' || protocol === 'http:' || protocol === 'https:') {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function formatRoleLabel(role: ThreadMessage['role']) {
  switch (role) {
    case 'user':
      return '用户';
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    default:
      return role;
  }
}

function formatSpeakerName(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode) {
    return formatRoleLabel(message.role);
  }

  return message.agentName ?? formatRoleLabel(message.role);
}

function formatSpeakerMeta(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentName) {
    return null;
  }

  return formatRoleLabel(message.role);
}

function readUsageNumber(usage: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = usage?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function formatRuntimeMeta(message: ThreadMessage) {
  if (message.role !== 'assistant') {
    return null;
  }

  const parts: string[] = [];
  if (message.model) {
    parts.push(message.model);
  }

  const inputTokens = readUsageNumber(message.usage, 'input_tokens', 'inputTokens');
  const outputTokens = readUsageNumber(message.usage, 'output_tokens', 'outputTokens');
  const totalTokens = readUsageNumber(message.usage, 'total_tokens', 'totalTokens')
    ?? (inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null);

  if (totalTokens !== null && totalTokens > 0) {
    parts.push(`${totalTokens.toLocaleString()} tokens`);
  }

  const stopReason = message.stopReason?.trim();
  if (stopReason && !/^(end_turn|stop|stop_sequence)$/i.test(stopReason)) {
    parts.push(stopReason);
  }

  return parts.length ? parts.join(' · ') : null;
}

function formatAgentAccentClass(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentAccent) {
    return null;
  }

  return `agent-${message.agentAccent}`;
}
