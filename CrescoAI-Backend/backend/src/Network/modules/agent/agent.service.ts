import { Injectable, Optional } from '@nestjs/common';
import {
  AgentAttachmentInput,
  AgentConversationMetadata,
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentSendMessageResult,
  AgentStreamEvent,
  type GeneratedFile,
  createConversation,
} from './agent.runtime';
import {
  runWithSessionContext,
  type SessionContext,
} from '../../../server/SessionContext.js';
import { createIsolatedState } from '../../../bootstrap/state.js';
import { createQueryEngineForSession } from '../../../server/queryEngineFactory.js';
import { QueryEngine } from '../../../QueryEngine.js';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { SettingsService } from '../settings/settings.service';
import { setSessionMultimodalConfig, removeSessionMultimodalConfig } from '../../../utils/multimodalConfig.js';
import { discoverGeneratedFiles } from './generated-output-discovery.js';
import { sanitizeServerPhysicalPaths } from '../../utils/publicOutputSanitizer.js';
import { getCommands } from '../../../commands.js';

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

const networkRootDir = fileURLToPath(new URL('../../', import.meta.url));
const userDataRootDir = join(networkRootDir, 'user');

async function appendJsonlEvent(
  userId: string,
  conversationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sessionFilePath = join(userDataRootDir, userId, `${conversationId}.jsonl`);
  await appendFile(sessionFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function createAssistantProcessBlock(thinking: string): Record<string, unknown> {
  return {
    type: 'thinking',
    phase: 'process',
    thinking: sanitizeServerPhysicalPaths(thinking),
    signature: '',
  };
}

function createAssistantFinalBlock(text: string): Record<string, unknown> {
  return {
    type: 'text',
    phase: 'final',
    text: sanitizeServerPhysicalPaths(text),
  };
}

function formatAgentProcessBlock(block: Record<string, unknown>): string {
  const blockType = typeof block.type === 'string' ? block.type : 'unknown';

  if (blockType === 'thinking' && typeof block.thinking === 'string') {
    return sanitizeServerPhysicalPaths(block.thinking);
  }

  if (blockType === 'reasoning' && typeof (block.reasoning ?? block.text) === 'string') {
    return sanitizeServerPhysicalPaths(String(block.reasoning ?? block.text));
  }

  if (blockType === 'text') {
    return '';
  }

  if (isToolFacingProcessBlock(blockType, block)) {
    return formatFilteredToolProcessBlock(blockType, block);
  }

  return formatFilteredStructuredProcessBlock(blockType);
}

function isToolResultProcessBlock(blockType: string, block: Record<string, unknown>): boolean {
  return (
    blockType === 'tool_result' ||
    blockType.endsWith('_tool_result') ||
    block.content !== undefined ||
    block.result !== undefined ||
    block.output !== undefined
  );
}

function isToolFacingProcessBlock(blockType: string, block: Record<string, unknown>): boolean {
  return (
    blockType === 'tool_use' ||
    blockType === 'tool_result' ||
    blockType === 'server_tool_use' ||
    blockType === 'mcp_tool_use' ||
    blockType.endsWith('_tool_use') ||
    blockType.endsWith('_tool_result') ||
    typeof block.tool_use_id === 'string' ||
    typeof block.toolUseId === 'string'
  );
}

function formatFilteredToolProcessBlock(
  blockType: string,
  block: Record<string, unknown>,
): string {
  if (isToolResultProcessBlock(blockType, block)) {
    return formatSanitizedToolResultProcessBlock(block);
  }

  return [
    '[工具调用]',
    '正在调用工具。',
  ].join('\n');
}

function formatSanitizedToolResultProcessBlock(block: Record<string, unknown>): string {
  const rawResult = extractToolResultText(block);
  const resultText = redactSensitiveProcessText(rawResult);
  return [
    '[工具返回]',
    resultText || (block.is_error === true || block.isError === true ? '工具返回错误。' : '工具已返回。'),
  ].join('\n');
}

function extractToolResultText(block: Record<string, unknown>): string {
  const value = block.content ?? block.result ?? block.output ?? block.error ?? block;
  return stringifyToolResultValue(value);
}

function stringifyToolResultValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (typeof item !== 'object' || item === null) {
          return String(item);
        }
        const typedItem = item as Record<string, unknown>;
        if (typedItem.type === 'text' && typeof typedItem.text === 'string') {
          return typedItem.text;
        }
        if (typeof typedItem.content === 'string') {
          return typedItem.content;
        }
        return stringifyToolResultValue(typedItem);
      })
      .filter(Boolean)
      .join('\n');
  }

  if (value === undefined || value === null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function redactSensitiveProcessText(input: string): string {
  let output = input;
  output = output.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1******');
  output = output.replace(
    /\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|pwd|private[_-]?key)\b(\s*[:=]\s*)(["']?)[^\s"',;]+/gi,
    '$1$2$3******',
  );
  output = output.replace(
    /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=)[^&\s"']+/gi,
    '$1******',
  );
  output = output.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '******');
  output = output.replace(/\b(?:sk|pk|rk|xox[baprs])-[A-Za-z0-9_-]{16,}\b/gi, '******');
  output = output.replace(/\b[A-Fa-f0-9]{64,}\b/g, '******');
  output = output.replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '******');
  output = output.replace(/C:\\Users\\[^\\\s"']+/gi, 'C:\\Users\\<user>');
  return sanitizeServerPhysicalPaths(output);
}

function formatFilteredStructuredProcessBlock(blockType: string): string {
  return [
    '[过程事件]',
    '正在处理过程事件。',
  ].join('\n');
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiting: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T) {
    if (this.closed) {
      return;
    }

    const resolve = this.waiting.shift();
    if (resolve) {
      resolve({ value, done: false });
      return;
    }

    this.values.push(value);
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const resolve of this.waiting.splice(0)) {
      resolve({ value: undefined as T, done: true });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value) {
      return { value, done: false };
    }

    if (this.closed) {
      return { value: undefined as T, done: true };
    }

    return new Promise((resolve) => this.waiting.push(resolve));
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const nextValue = await this.next();
      if (nextValue.done) {
        return;
      }
      yield nextValue.value;
    }
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Per-conversation config persisted from createConversation */
interface ConversationConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

@Injectable()
export class AgentService {
  /** Per-conversation LLM config (apiKey / baseUrl / model) */
  private conversationConfigs = new Map<string, ConversationConfig>();
  /** Per-conversation QueryEngine instances (manages own message history) */
  private queryEngines = new Map<string, QueryEngine>();
  /** Per-conversation SessionContext for ALS routing */
  private sessionContexts = new Map<string, SessionContext>();

  constructor(@Optional() private readonly settingsService?: SettingsService) {}

  async runIsolatedPrompt(input: {
    userId: string;
    content: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    conversationId?: string;
    abortSignal?: AbortSignal;
    onProgress?: (event: {
      type: 'reasoning.delta' | 'reply.delta';
      delta: string;
    }) => void;
  }): Promise<{
    success: boolean;
    reply?: string;
    thinking?: string;
    model?: string;
    generatedFiles?: GeneratedFile[];
  }> {
    const tempConversationId =
      input.conversationId && input.conversationId.trim().length > 0
        ? `${input.conversationId}-skill`
        : `skill-${randomUUID()}`;

    try {
      const config = {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
      };
      let result;

      if (input.onProgress || input.abortSignal) {
        const eventQueue = new AsyncEventQueue<AgentStreamEvent>();
        const inferencePromise = this.runStreamingInference({
          input: {
            conversationId: tempConversationId,
            userId: input.userId,
            content: input.content,
            userVisibleContent: input.content,
            abortSignal: input.abortSignal,
          },
          config,
          userEventUuid: randomUUID(),
          assistantMessageId: `msg_assistant_skill_${randomUUID().replace(/-/g, '')}`,
          startTime: Date.now(),
          eventQueue,
        });

        for await (const event of eventQueue) {
          if (event.type === 'reasoning.delta' || event.type === 'reply.delta') {
            input.onProgress?.({ type: event.type, delta: event.delta });
          }
        }
        result = await inferencePromise;
      } else {
        result = await this.runQueryEngineInference(
          tempConversationId,
          input.userId,
          input.content,
          config,
        );
      }

      if (!result.success) return { success: false };
      return {
        success: true,
        reply: result.reply,
        thinking: result.thinking,
        model: result.model,
        generatedFiles: result.generatedFiles,
      };
    } finally {
      this.queryEngines.delete(tempConversationId);
      this.sessionContexts.delete(tempConversationId);
      this.conversationConfigs.delete(tempConversationId);
    }
  }

  async runInSessionContext<T>(input: {
    userId: string;
    conversationId?: string;
    config?: { apiKey?: string; baseUrl?: string; model?: string };
    callback: (context: SessionContext) => Promise<T>;
  }): Promise<T> {
    const sessionId =
      input.conversationId && input.conversationId.trim().length > 0
        ? input.conversationId
        : `skill-tool-${randomUUID()}`;
    const isTemporarySession = !input.conversationId || input.conversationId.trim().length === 0;
    const userWorkspaceDir = join(userDataRootDir, String(input.userId));
    await mkdir(userWorkspaceDir, { recursive: true });

    let ctx = this.sessionContexts.get(sessionId);
    if (!ctx) {
      ctx = this.buildSessionContext(
        sessionId,
        input.userId,
        input.config ?? {},
        userWorkspaceDir,
      );
      this.sessionContexts.set(sessionId, ctx);
    }

    if (this.settingsService) {
      const saved = await this.settingsService.getApiSettings(Number(input.userId));
      if (saved) {
        setSessionMultimodalConfig(sessionId, {
          image_url: saved.imageUrl,
          image_key: saved.imageKey,
          image_default_model: saved.imageDefaultModel,
          image_models: saved.imageModels
            ? saved.imageModels.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          video_url: saved.videoUrl,
          video_key: saved.videoKey,
          video_default_model: saved.videoDefaultModel,
          video_models: saved.videoModels
            ? saved.videoModels.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
        });
      }
    }

    try {
      return await runWithSessionContext(ctx, async () => input.callback(ctx));
    } finally {
      removeSessionMultimodalConfig(sessionId);
      if (isTemporarySession) {
        this.sessionContexts.delete(sessionId);
        this.queryEngines.delete(sessionId);
        this.conversationConfigs.delete(sessionId);
      }
    }
  }

  async createConversation(
    input: AgentCreateConversationInput,
  ): Promise<AgentConversationMetadata> {
    const meta = await createConversation(input);
    if (input.apiKey || input.baseUrl || input.model) {
      this.conversationConfigs.set(meta.conversationId, {
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
      });
    }
    return meta;
  }

  async sendMessage(input: AgentSendMessageInput): Promise<AgentSendMessageResult> {
    const { conversationId, userId, content, clientRequestId } = input;
    const userVisibleContent = input.userVisibleContent ?? content;
    const userMessageId = input.userMessageId ?? `msg_user_${randomUUID().replace(/-/g, '')}`;
    const assistantMessageId = input.assistantMessageId ?? `msg_assistant_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();

    // 1. Write user message event to JSONL
    const userEventUuid = randomUUID();
    await appendJsonlEvent(userId, conversationId, {
      parentUuid: null,
      isSidechain: false,
      promptId: clientRequestId ?? randomUUID(),
      type: 'user',
      message: {
        id: userMessageId,
        role: 'user',
        content: userVisibleContent,
      },
      uuid: userEventUuid,
      timestamp: now.toISOString(),
      sessionId: conversationId,
    });

    // 2. Merge config: message-level override > conversation-level config > user-level settings
    const convCfg = this.conversationConfigs.get(conversationId);
    let userSettings: ConversationConfig = {};
    if (this.settingsService) {
      const saved = await this.settingsService.getApiSettings(Number(userId));
      if (saved) {
        userSettings = { apiKey: saved.apiKey ?? undefined, baseUrl: saved.baseUrl ?? undefined, model: saved.model ?? undefined };
      }
    }
    const mergedConfig: ConversationConfig = {
      apiKey: input.apiKey ?? convCfg?.apiKey ?? userSettings.apiKey,
      baseUrl: input.baseUrl ?? convCfg?.baseUrl ?? userSettings.baseUrl,
      model: input.model ?? convCfg?.model ?? userSettings.model,
    };

    if (!mergedConfig.apiKey?.trim()) {
      const errorReply = 'API key is required. Please save an Anthropic API key in Settings before sending messages.';
      const replyUuid = randomUUID();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: mergedConfig.model ?? 'unknown',
          content: [createAssistantFinalBlock(errorReply)],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
        uuid: replyUuid,
        timestamp: new Date(now.getTime() + 100).toISOString(),
        sessionId: conversationId,
      });
      return {
        accepted: false,
        status: 'failed',
        conversationId,
        userMessageId,
        assistantMessageId,
        reply: errorReply,
        raw: { error: 'API_KEY_REQUIRED' },
      };
    }

    // 3. Run inference via QueryEngine
    const qeResult = await this.runQueryEngineInference(
      conversationId,
      userId,
      content,
      mergedConfig,
      input.attachments ?? [],
    );

    if (qeResult.success) {
      // Write assistant thinking event
      const thinkingUuid = randomUUID();
      const thinkingTimestamp = new Date(now.getTime() + 100).toISOString();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: qeResult.model ?? 'unknown',
          content: [createAssistantProcessBlock(qeResult.thinking ?? '')],
          stop_reason: null,
          stop_sequence: null,
          usage: qeResult.usage ?? { input_tokens: 0, output_tokens: 0 },
        },
        uuid: thinkingUuid,
        timestamp: thinkingTimestamp,
        sessionId: conversationId,
      });

      // Write assistant text reply event
      const replyUuid = randomUUID();
      const replyTimestamp = new Date(now.getTime() + 500 + (qeResult.durationMs ?? 0)).toISOString();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: thinkingUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: qeResult.model ?? 'unknown',
          content: [createAssistantFinalBlock(qeResult.reply)],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: qeResult.usage ?? { input_tokens: 0, output_tokens: 0 },
        },
        uuid: replyUuid,
        timestamp: replyTimestamp,
        sessionId: conversationId,
      });

      return {
        accepted: true,
        status: 'done',
        conversationId,
        userMessageId,
        assistantMessageId,
        reply: qeResult.reply,
        reasoning: qeResult.thinking,
        generatedFiles: qeResult.generatedFiles,
        raw: {
          model: qeResult.model,
          usage: qeResult.usage,
          durationMs: qeResult.durationMs,
        },
      };
    }

    // 4. Fallback to stub if QueryEngine unavailable
    const stubReply = sanitizeServerPhysicalPaths(`Stub agent reply: ${userVisibleContent}`);
    const thinkingUuid = randomUUID();
    const replyUuid = randomUUID();
    const thinkingTimestamp = new Date(now.getTime() + 300).toISOString();
    const replyTimestamp = new Date(now.getTime() + 700).toISOString();

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: userEventUuid,
      isSidechain: false,
      type: 'assistant',
      message: {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        model: 'stub-agent',
        content: [createAssistantProcessBlock(`Preparing a response for: ${userVisibleContent}`)],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: thinkingUuid,
      timestamp: thinkingTimestamp,
      sessionId: conversationId,
    });

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: thinkingUuid,
      isSidechain: false,
      type: 'assistant',
      message: {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        model: 'stub-agent',
        content: [createAssistantFinalBlock(stubReply)],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: replyUuid,
      timestamp: replyTimestamp,
      sessionId: conversationId,
    });

    return {
      accepted: true,
      status: 'done',
      conversationId,
      userMessageId,
      assistantMessageId,
      reply: stubReply,
      reasoning: sanitizeServerPhysicalPaths(`Preparing a response for: ${userVisibleContent}`),
      raw: {
        kind: input.kind ?? 'markdown',
        attachmentCount: input.attachments?.length ?? 0,
        context: input.context ?? {},
        fallback: true,
      },
    };
  }

  async *sendMessageStream(input: AgentSendMessageInput): AsyncGenerator<AgentStreamEvent> {
    const { conversationId, userId, content, clientRequestId } = input;
    const userVisibleContent = input.userVisibleContent ?? content;
    const userMessageId = input.userMessageId ?? `msg_user_${randomUUID().replace(/-/g, '')}`;
    const assistantMessageId = input.assistantMessageId ?? `msg_assistant_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const userEventUuid = randomUUID();

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: null,
      isSidechain: false,
      promptId: clientRequestId ?? randomUUID(),
      type: 'user',
      message: {
        id: userMessageId,
        role: 'user',
        content: userVisibleContent,
      },
      uuid: userEventUuid,
      timestamp: now.toISOString(),
      sessionId: conversationId,
    });

    yield {
      type: 'message.created',
      conversationId,
      userMessageId,
      assistantMessageId,
      createdAt: now.toISOString(),
    };

    const convCfg = this.conversationConfigs.get(conversationId);
    let userSettings: ConversationConfig = {};
    if (this.settingsService) {
      const saved = await this.settingsService.getApiSettings(Number(userId));
      if (saved) {
        userSettings = {
          apiKey: saved.apiKey ?? undefined,
          baseUrl: saved.baseUrl ?? undefined,
          model: saved.model ?? undefined,
        };
      }
    }
    const mergedConfig: ConversationConfig = {
      apiKey: input.apiKey ?? convCfg?.apiKey ?? userSettings.apiKey,
      baseUrl: input.baseUrl ?? convCfg?.baseUrl ?? userSettings.baseUrl,
      model: input.model ?? convCfg?.model ?? userSettings.model,
    };

    if (!mergedConfig.apiKey?.trim()) {
      const errorReply = 'API key is required. Please save an Anthropic API key in Settings before sending messages.';
      const replyUuid = randomUUID();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: mergedConfig.model ?? 'unknown',
          content: [createAssistantFinalBlock(errorReply)],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
        uuid: replyUuid,
        timestamp: new Date(now.getTime() + 100).toISOString(),
        sessionId: conversationId,
      });

      yield { type: 'reply.delta', messageId: assistantMessageId, delta: errorReply };
      yield {
        type: 'message.completed',
        accepted: false,
        status: 'failed',
        conversationId,
        userMessageId,
        assistantMessageId,
        reply: errorReply,
        raw: { error: 'API_KEY_REQUIRED' },
      };
      return;
    }

    const startTime = Date.now();
    const eventQueue = new AsyncEventQueue<AgentStreamEvent>();
    const inferencePromise = this.runStreamingInference({
      input,
      config: mergedConfig,
      userEventUuid,
      assistantMessageId,
      startTime,
      eventQueue,
    });

    for await (const event of eventQueue) {
      yield event;
    }

    const qeResult = await inferencePromise;
    if (qeResult.success) {
      const thinkingUuid = randomUUID();
      const thinkingTimestamp = new Date(now.getTime() + 100).toISOString();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: qeResult.model ?? 'unknown',
          content: [createAssistantProcessBlock(qeResult.thinking ?? '')],
          stop_reason: null,
          stop_sequence: null,
          usage: qeResult.usage ?? { input_tokens: 0, output_tokens: 0 },
        },
        uuid: thinkingUuid,
        timestamp: thinkingTimestamp,
        sessionId: conversationId,
      });

      const replyUuid = randomUUID();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: thinkingUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: qeResult.model ?? 'unknown',
          content: [createAssistantFinalBlock(qeResult.reply)],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: qeResult.usage ?? { input_tokens: 0, output_tokens: 0 },
        },
        uuid: replyUuid,
        timestamp: new Date(now.getTime() + 500 + (qeResult.durationMs ?? 0)).toISOString(),
        sessionId: conversationId,
      });

      yield {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        conversationId,
        userMessageId,
        assistantMessageId,
        reply: qeResult.reply,
        reasoning: qeResult.thinking,
        generatedFiles: qeResult.generatedFiles,
        raw: {
          model: qeResult.model,
          usage: qeResult.usage,
          durationMs: qeResult.durationMs,
        },
      };
      return;
    }

    const stubReply = sanitizeServerPhysicalPaths(`Stub agent reply: ${userVisibleContent}`);
    const stubThinking = sanitizeServerPhysicalPaths(`Preparing a response for: ${userVisibleContent}`);
    const thinkingUuid = randomUUID();
    const replyUuid = randomUUID();

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: userEventUuid,
      isSidechain: false,
      type: 'assistant',
      message: {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        model: 'stub-agent',
        content: [createAssistantProcessBlock(stubThinking)],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: thinkingUuid,
      timestamp: new Date(now.getTime() + 300).toISOString(),
      sessionId: conversationId,
    });

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: thinkingUuid,
      isSidechain: false,
      type: 'assistant',
      message: {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        model: 'stub-agent',
        content: [createAssistantFinalBlock(stubReply)],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: replyUuid,
      timestamp: new Date(now.getTime() + 700).toISOString(),
      sessionId: conversationId,
    });

    yield { type: 'reasoning.delta', messageId: assistantMessageId, delta: stubThinking };
    yield { type: 'reply.delta', messageId: assistantMessageId, delta: stubReply };
    yield {
      type: 'message.completed',
      accepted: true,
      status: 'done',
      conversationId,
      userMessageId,
      assistantMessageId,
      reply: stubReply,
      reasoning: stubThinking,
      raw: {
        kind: input.kind ?? 'markdown',
        attachmentCount: input.attachments?.length ?? 0,
        context: input.context ?? {},
        fallback: true,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private: real LLM inference via existing QueryEngine
  // -------------------------------------------------------------------------

  private async runStreamingInference(input: {
    input: AgentSendMessageInput;
    config: ConversationConfig;
    userEventUuid: string;
    assistantMessageId: string;
    startTime: number;
    eventQueue: AsyncEventQueue<AgentStreamEvent>;
  }): Promise<
    | {
        success: true;
        reply: string;
        thinking?: string;
        model?: string;
        usage?: Record<string, unknown>;
        durationMs?: number;
        generatedFiles?: GeneratedFile[];
      }
    | { success: false }
  > {
    const {
      input: messageInput,
      config,
      assistantMessageId,
      startTime,
      eventQueue,
    } = input;
    const { conversationId, userId, content } = messageInput;
    let abortHandler: (() => void) | undefined;

    try {
      const userWorkspaceDir = join(userDataRootDir, String(userId));
      await mkdir(userWorkspaceDir, { recursive: true });

      if (this.settingsService) {
        const saved = await this.settingsService.getApiSettings(Number(userId));
        if (saved) {
          setSessionMultimodalConfig(conversationId, {
            image_url: saved.imageUrl,
            image_key: saved.imageKey,
            image_default_model: saved.imageDefaultModel,
            image_models: saved.imageModels
              ? saved.imageModels.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
            video_url: saved.videoUrl,
            video_key: saved.videoKey,
            video_default_model: saved.videoDefaultModel,
            video_models: saved.videoModels
              ? saved.videoModels.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
          });
        }
      }

      let queryEngine = this.queryEngines.get(conversationId);
      if (!queryEngine) {
        const ctx = this.buildSessionContext(
          conversationId,
          userId,
          config,
          userWorkspaceDir,
        );
        this.sessionContexts.set(conversationId, ctx);
        const commands = await getCommands(userWorkspaceDir);
        queryEngine = createQueryEngineForSession(ctx, { commands });
        ctx.queryEngine = queryEngine;
        this.queryEngines.set(conversationId, queryEngine);
      }

      const ctx = this.sessionContexts.get(conversationId)!;
      if (messageInput.abortSignal) {
        abortHandler = () => {
          try {
            ctx.abortController?.abort();
          } catch {
            // Best-effort abort; QueryEngine implementations may differ.
          }
        };
        messageInput.abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      const prevApiKey = process.env.ANTHROPIC_API_KEY;
      const prevBaseUrl = process.env.ANTHROPIC_BASE_URL;
      const prevModel = process.env.ANTHROPIC_MODEL;

      if (config.apiKey) {
        process.env.ANTHROPIC_API_KEY = config.apiKey;
      }
      if (config.baseUrl) {
        process.env.ANTHROPIC_BASE_URL = config.baseUrl;
      }
      if (config.model) {
        process.env.ANTHROPIC_MODEL = config.model;
      }

      const result = await (async () => {
        try {
          return await runWithSessionContext(ctx, async () => {
            const textParts: string[] = [];
            const thinkingParts: string[] = [];
            let model: string | undefined;
            let usage: Record<string, unknown> | undefined;

            const inputWithAttachments = this.buildPromptWithAttachmentMentions(
              content,
              userId,
              conversationId,
              messageInput.attachments ?? [],
            );
            const stream = queryEngine!.submitMessage(inputWithAttachments);

            for await (const msg of stream) {
              if (messageInput.abortSignal?.aborted) {
                return { reply: '', thinking: '', model, usage, aborted: true };
              }

              const msgMessage = (msg as any).message;
              if (msgMessage && Array.isArray(msgMessage.content)) {
                for (const block of msgMessage.content) {
                  const blockType = typeof block.type === 'string' ? block.type : '';
                  if (blockType === 'text' && typeof block.text === 'string' && block.text) {
                    const safeText = sanitizeServerPhysicalPaths(block.text);
                    textParts.push(safeText);
                    eventQueue.push({
                      type: 'reply.delta',
                      messageId: assistantMessageId,
                      delta: safeText,
                    });
                  }

                  const reasoningText = formatAgentProcessBlock(block);

                  if (reasoningText) {
                    thinkingParts.push(reasoningText);
                    eventQueue.push({
                      type: 'reasoning.delta',
                      messageId: assistantMessageId,
                      delta: reasoningText,
                    });
                  }
                }
                if (msgMessage.model && !model) {
                  model = msgMessage.model;
                }
                if (msgMessage.usage && !usage) {
                  usage = msgMessage.usage;
                }
              } else if ((msg as any).type !== 'result') {
                const reasoningText = formatAgentProcessBlock(msg as Record<string, unknown>);
                if (reasoningText) {
                  thinkingParts.push(reasoningText);
                  eventQueue.push({
                    type: 'reasoning.delta',
                    messageId: assistantMessageId,
                    delta: reasoningText,
                  });
                }
              }

              if ((msg as any).type === 'result' && typeof (msg as any).result === 'string' && !textParts.length) {
                const safeResult = sanitizeServerPhysicalPaths((msg as any).result);
                textParts.push(safeResult);
                eventQueue.push({
                  type: 'reply.delta',
                  messageId: assistantMessageId,
                  delta: safeResult,
                });
              }
            }

            const reply = sanitizeServerPhysicalPaths(textParts.join('\n').trim());
            const thinking = sanitizeServerPhysicalPaths(thinkingParts.join('\n').trim());

            return { reply, thinking, model, usage };
          });
        } finally {
          if (prevApiKey === undefined) {
            delete process.env.ANTHROPIC_API_KEY;
          } else {
            process.env.ANTHROPIC_API_KEY = prevApiKey;
          }
          if (prevBaseUrl === undefined) {
            delete process.env.ANTHROPIC_BASE_URL;
          } else {
            process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
          }
          if (prevModel === undefined) {
            delete process.env.ANTHROPIC_MODEL;
          } else {
            process.env.ANTHROPIC_MODEL = prevModel;
          }
          removeSessionMultimodalConfig(conversationId);
          if (abortHandler && messageInput.abortSignal) {
            messageInput.abortSignal.removeEventListener('abort', abortHandler);
          }
        }
      })();

      if (!result.reply || result.aborted) {
        return { success: false };
      }

      const generatedFiles = await this.scanGeneratedFiles(
        join(userDataRootDir, String(userId)),
        startTime,
      );

      return {
        success: true,
        reply: result.reply,
        thinking: result.thinking || undefined,
        model: result.model,
        usage: result.usage,
        durationMs: Date.now() - startTime,
        generatedFiles: generatedFiles.length ? generatedFiles : undefined,
      };
    } catch (err: any) {
      console.error('[AgentService] QueryEngine streaming inference FAILED:', err?.message ?? err);
      return { success: false };
    } finally {
      eventQueue.close();
    }
  }

  private async runQueryEngineInference(
    conversationId: string,
    userId: string,
    content: string,
    config: ConversationConfig,
    attachments: AgentAttachmentInput[] = [],
  ): Promise<
    | {
        success: true;
        reply: string;
        thinking?: string;
        model?: string;
        usage?: Record<string, unknown>;
        durationMs?: number;
        generatedFiles?: GeneratedFile[];
      }
    | { success: false }
  > {
    const startTime = Date.now();

    try {
      const userWorkspaceDir = join(userDataRootDir, String(userId));
      await mkdir(userWorkspaceDir, { recursive: true });

      // Inject per-user multimodal config BEFORE engine creation so isEnabled() sees it.
      // Also refreshed on every request so updated DB settings take effect immediately.
      if (this.settingsService) {
        const saved = await this.settingsService.getApiSettings(Number(userId));
        if (saved) {
          setSessionMultimodalConfig(conversationId, {
            image_url: saved.imageUrl,
            image_key: saved.imageKey,
            image_default_model: saved.imageDefaultModel,
            image_models: saved.imageModels
              ? saved.imageModels.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
            video_url: saved.videoUrl,
            video_key: saved.videoKey,
            video_default_model: saved.videoDefaultModel,
            video_models: saved.videoModels
              ? saved.videoModels.split(',').map((s) => s.trim()).filter(Boolean)
              : undefined,
          });
        }
      }

      // Get or create per-conversation QueryEngine + SessionContext
      let queryEngine = this.queryEngines.get(conversationId);
      if (!queryEngine) {
        const ctx = this.buildSessionContext(
          conversationId,
          userId,
          config,
          userWorkspaceDir,  // absolute path — relative paths double up after the first setCwd call
        );
        this.sessionContexts.set(conversationId, ctx);
        const commands = await getCommands(userWorkspaceDir);
        queryEngine = createQueryEngineForSession(ctx, { commands });
        ctx.queryEngine = queryEngine;
        this.queryEngines.set(conversationId, queryEngine);
      }

      const ctx = this.sessionContexts.get(conversationId)!;

      // Run inside ALS context so all module-level helpers route correctly
      const prevApiKey = process.env.ANTHROPIC_API_KEY
      const prevBaseUrl = process.env.ANTHROPIC_BASE_URL
      const prevModel = process.env.ANTHROPIC_MODEL

      if (config.apiKey) {
        process.env.ANTHROPIC_API_KEY = config.apiKey
      }
      if (config.baseUrl) {
        process.env.ANTHROPIC_BASE_URL = config.baseUrl
      }
      if (config.model) {
        process.env.ANTHROPIC_MODEL = config.model
      }

      const result = await (async () => {
        try {
          return await runWithSessionContext(ctx, async () => {
            const textParts: string[] = [];
            const thinkingParts: string[] = [];
            let model: string | undefined;

            const inputWithAttachments = this.buildPromptWithAttachmentMentions(
              content,
              userId,
              conversationId,
              attachments,
            );
            const stream = queryEngine!.submitMessage(inputWithAttachments);

            for await (const msg of stream) {
              const msgMessage = (msg as any).message;
              if (msgMessage && Array.isArray(msgMessage.content)) {
                for (const block of msgMessage.content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    textParts.push(sanitizeServerPhysicalPaths(block.text));
                  }
                  const reasoningText = formatAgentProcessBlock(block);
                  if (reasoningText) {
                    thinkingParts.push(reasoningText);
                  }
                }
                if (msgMessage.model && !model) {
                  model = msgMessage.model;
                }
              } else if ((msg as any).type !== 'result') {
                const reasoningText = formatAgentProcessBlock(msg as Record<string, unknown>);
                if (reasoningText) {
                  thinkingParts.push(reasoningText);
                }
              }

              if ((msg as any).type === 'result' && typeof (msg as any).result === 'string' && !textParts.length) {
                textParts.push(sanitizeServerPhysicalPaths((msg as any).result));
              }
            }

            const reply = sanitizeServerPhysicalPaths(textParts.join('\n').trim());
            const thinking = sanitizeServerPhysicalPaths(thinkingParts.join('\n').trim());

            return { reply, thinking, model };
          });
        } finally {
          if (prevApiKey === undefined) {
            delete process.env.ANTHROPIC_API_KEY;
          } else {
            process.env.ANTHROPIC_API_KEY = prevApiKey;
          }
          if (prevBaseUrl === undefined) {
            delete process.env.ANTHROPIC_BASE_URL;
          } else {
            process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
          }
          if (prevModel === undefined) {
            delete process.env.ANTHROPIC_MODEL;
          } else {
            process.env.ANTHROPIC_MODEL = prevModel;
          }
          removeSessionMultimodalConfig(conversationId);
        }
      })();

      if (!result.reply) {
        console.error('[AgentService] QueryEngine returned empty reply');
        return { success: false };
      }

      const generatedFiles = await this.scanGeneratedFiles(
        join(userDataRootDir, String(userId)),
        startTime,
      );

      return {
        success: true,
        reply: result.reply,
        thinking: result.thinking || undefined,
        model: result.model,
        durationMs: Date.now() - startTime,
        generatedFiles: generatedFiles.length ? generatedFiles : undefined,
      };
    } catch (err: any) {
      console.error('[AgentService] QueryEngine inference FAILED:', err?.message ?? err);
      return { success: false };
    }
  }

  private async scanGeneratedFiles(
    workspaceDir: string,
    sinceMs: number,
  ): Promise<GeneratedFile[]> {
    return discoverGeneratedFiles(workspaceDir, sinceMs);
  }

  private buildSessionContext(
    conversationId: string,
    userId: string,
    config: ConversationConfig = {},
    workspaceDir?: string,
  ): SessionContext {
    return {
      sessionId: conversationId,
      userId,
      state: createIsolatedState({ sessionId: conversationId as any }),
      config: {
        cwd: workspaceDir ?? process.cwd(),
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      },
      anthropicClient: null,
      queryEngine: null,
      mcpClients: [],
      wsConnections: new Set(),
      abortController: new AbortController(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      isHeadless: true,
      sessionSwitched: {
        subscribe: () => {},
        emit: () => {},
      },
      pendingToolResponses: new Map(),
    } as unknown as SessionContext;
  }

  private buildPromptWithAttachmentMentions(
    content: string,
    userId: string,
    conversationId: string,
    attachments: AgentAttachmentInput[],
  ): string {
    if (!attachments.length) {
      return content;
    }

    // Use native attachment ingestion chain:
    // QueryEngine.submitMessage -> processUserInput -> getAttachmentMessages.
    // Appending @paths allows the existing parser to generate structured
    // attachment messages (including PDF/pdf_reference behavior).
    const mentionLines = attachments.map((attachment) => {
      const absPath = this.resolveAttachmentAbsolutePath(
        attachment.path,
        userId,
        conversationId,
      );
      return `@${absPath}`;
    });

    return [content, '', ...mentionLines].join('\n');
  }

  private resolveAttachmentAbsolutePath(
    inputPath: string,
    userId: string,
    conversationId: string,
  ): string {
    if (inputPath.startsWith('/api/career-agent/threads/')) {
      const fileName = inputPath.split('/').pop() ?? '';
      return join(networkRootDir, 'files', String(userId), conversationId, fileName);
    }

    const marker = '/src/Network/files/';
    const normalized = inputPath.replaceAll('\\', '/');
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      const relative = normalized.slice(markerIndex + '/src/Network/'.length);
      return join(networkRootDir, relative);
    }

    if (normalized.startsWith('./src/Network/files/')) {
      const relative = normalized.replace('./src/Network/', '');
      return join(networkRootDir, relative);
    }

    if (normalized.startsWith('files/')) {
      return join(networkRootDir, normalized);
    }

    return normalized;
  }
}
