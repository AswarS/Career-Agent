import { Injectable } from '@nestjs/common';
import {
  AgentConversationMetadata,
  AgentAttachmentInput,
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentSendMessageResult,
  createConversation,
} from './agent.runtime';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

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

async function readJsonlEvents(
  userId: string,
  conversationId: string,
): Promise<Record<string, unknown>[]> {
  const sessionFilePath = join(userDataRootDir, userId, `${conversationId}.jsonl`);

  try {
    const raw = await readFile(sessionFilePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((event): event is Record<string, unknown> => Boolean(event));
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }

    throw error;
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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

type AgentInferenceResult =
  | {
      success: true;
      reply: string;
      model?: string;
      usage?: Record<string, unknown>;
      durationMs?: number;
    }
  | {
      success: false;
      errorMessage?: string;
      status?: number;
    };

const defaultAnthropicBaseUrl = 'https://api.anthropic.com';
const defaultAnthropicModel = 'claude-sonnet-4-5';
const anthropicVersion = '2023-06-01';
const maxHistoryMessages = 30;

@Injectable()
export class AgentService {
  /** Per-conversation LLM config (apiKey / baseUrl / model) */
  private conversationConfigs = new Map<string, ConversationConfig>();

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
    const userMessageId = `msg_user_${randomUUID().replace(/-/g, '')}`;
    const assistantMessageId = `msg_assistant_${randomUUID().replace(/-/g, '')}`;
    const now = new Date();
    const userContent = this.composeUserContent(content, input.attachments);

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
        content: userContent,
      },
      uuid: userEventUuid,
      timestamp: now.toISOString(),
      sessionId: conversationId,
    });

    // 2. Merge config: message-level override > conversation-level config
    const convCfg = this.conversationConfigs.get(conversationId);
    const mergedConfig: ConversationConfig = {
      apiKey: input.apiKey ?? convCfg?.apiKey,
      baseUrl: input.baseUrl ?? convCfg?.baseUrl,
      model: input.model ?? convCfg?.model,
    };
    this.syncConversationConfig(conversationId, mergedConfig);

    // 3. Run inference via Anthropic Messages API directly. The legacy runtime
    // can emit CLI-oriented requests that normal API keys reject.
    const inferenceResult = await this.runAnthropicInference(
      conversationId,
      userId,
      userContent,
      mergedConfig,
    );

    if (inferenceResult.success) {
      const replyUuid = randomUUID();
      const replyTimestamp = new Date(now.getTime() + 500 + (inferenceResult.durationMs ?? 0)).toISOString();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: inferenceResult.model ?? mergedConfig.model ?? defaultAnthropicModel,
          content: [
            {
              type: 'text',
              text: inferenceResult.reply,
            },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: inferenceResult.usage ?? { input_tokens: 0, output_tokens: 0 },
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
        reply: inferenceResult.reply,
        raw: {
          model: inferenceResult.model,
          usage: inferenceResult.usage,
          durationMs: inferenceResult.durationMs,
          provider: 'anthropic',
        },
      };
    }

    // 4. Persist the failed assistant turn so the UI can display a concrete
    // API error instead of a misleading placeholder answer.
    const errorReply =
      inferenceResult.errorMessage ??
      'Anthropic inference failed. Please check the saved API key, base URL, and model.';
    const replyUuid = randomUUID();
    const replyTimestamp = new Date(now.getTime() + 700).toISOString();

    await appendJsonlEvent(userId, conversationId, {
      parentUuid: userEventUuid,
      isSidechain: false,
      type: 'assistant',
      message: {
        id: assistantMessageId,
        type: 'message',
        role: 'assistant',
        model: mergedConfig.model ?? defaultAnthropicModel,
        content: [{ type: 'text', text: errorReply }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      uuid: replyUuid,
      timestamp: replyTimestamp,
      sessionId: conversationId,
    });

    return {
      accepted: false,
      status: 'failed',
      conversationId,
      userMessageId,
      assistantMessageId,
      reply: errorReply,
      raw: {
        kind: input.kind ?? 'markdown',
        attachmentCount: input.attachments?.length ?? 0,
        context: input.context ?? {},
        provider: 'anthropic',
        status: inferenceResult.status,
        error: inferenceResult.errorMessage,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private: real LLM inference via Anthropic Messages API
  // -------------------------------------------------------------------------

  private async runAnthropicInference(
    conversationId: string,
    userId: string,
    currentUserContent: string,
    config: ConversationConfig,
  ): Promise<AgentInferenceResult> {
    const startTime = Date.now();
    const apiKey = config.apiKey?.trim();

    if (!apiKey) {
      return {
        success: false,
        errorMessage: 'API key is required before sending messages.',
        status: 400,
      };
    }

    const model = config.model?.trim() || defaultAnthropicModel;
    const baseUrl = this.normalizeBaseUrl(config.baseUrl || defaultAnthropicBaseUrl);
    const endpoint = this.buildAnthropicMessagesEndpoint(baseUrl);

    try {
      const messages = await this.buildAnthropicMessages(
        userId,
        conversationId,
        currentUserContent,
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': anthropicVersion,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages,
        }),
      });
      const responseText = await response.text();
      const responseBody = this.tryParseJson(responseText);

      if (!response.ok) {
        const errorMessage =
          this.extractAnthropicErrorMessage(responseBody) ||
          responseText ||
          `Anthropic API request failed with status ${response.status}`;
        console.error('[AgentService] Anthropic inference FAILED:', errorMessage);
        return {
          success: false,
          errorMessage: `Anthropic API Error: ${response.status} ${errorMessage}`,
          status: response.status,
        };
      }

      const reply = this.extractAnthropicReply(responseBody).trim();

      if (!reply) {
        console.error('[AgentService] Anthropic inference returned empty reply');
        return {
          success: false,
          errorMessage: 'Anthropic inference returned an empty reply.',
          status: response.status,
        };
      }

      return {
        success: true,
        reply,
        model: this.getStringField(responseBody, 'model') || model,
        usage: this.getRecordField(responseBody, 'usage'),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const errorMessage = err?.message ? String(err.message) : String(err);
      console.error('[AgentService] Anthropic inference FAILED:', errorMessage);
      return {
        success: false,
        errorMessage,
        status: 0,
      };
    }
  }

  private syncConversationConfig(
    conversationId: string,
    nextConfig: ConversationConfig,
  ) {
    const previousConfig = this.conversationConfigs.get(conversationId);
    const normalizedNext = this.normalizeConversationConfig(nextConfig);

    if (!this.hasConfigValues(normalizedNext)) {
      return;
    }

    if (!previousConfig) {
      this.conversationConfigs.set(conversationId, normalizedNext);
      return;
    }

    if (!this.areConversationConfigsEqual(previousConfig, normalizedNext)) {
      this.conversationConfigs.set(conversationId, normalizedNext);
    }
  }

  private normalizeConversationConfig(config: ConversationConfig): ConversationConfig {
    return {
      apiKey: config.apiKey?.trim() || undefined,
      baseUrl: config.baseUrl ? this.normalizeBaseUrl(config.baseUrl) : undefined,
      model: config.model?.trim() || undefined,
    };
  }

  private hasConfigValues(config: ConversationConfig) {
    return Boolean(config.apiKey || config.baseUrl || config.model);
  }

  private areConversationConfigsEqual(
    a: ConversationConfig,
    b: ConversationConfig,
  ) {
    return a.apiKey === b.apiKey && a.baseUrl === b.baseUrl && a.model === b.model;
  }

  private composeUserContent(
    content: string,
    attachments: AgentAttachmentInput[] = [],
  ) {
    const trimmedContent = content.trim();
    const attachmentLines = attachments
      .map((attachment) => {
        const title = attachment.title || attachment.assetId;
        const mimeType = attachment.mimeType ? `, ${attachment.mimeType}` : '';
        return `- ${title} (${attachment.path}${mimeType})`;
      })
      .filter(Boolean);

    if (!attachmentLines.length) {
      return trimmedContent;
    }

    return [
      trimmedContent,
      '',
      'Attached files available to the backend:',
      ...attachmentLines,
    ].join('\n');
  }

  private async buildAnthropicMessages(
    userId: string,
    conversationId: string,
    fallbackContent: string,
  ): Promise<AnthropicMessage[]> {
    const events = await readJsonlEvents(userId, conversationId);
    const messages: AnthropicMessage[] = [];

    for (const event of events) {
      const message = this.getRecordField(event, 'message');
      const role = this.getStringField(message, 'role');

      if (event.type === 'user' && role === 'user') {
        const content = this.extractPlainText(this.getUnknownField(message, 'content'));
        this.pushAnthropicMessage(messages, 'user', content);
      }

      if (event.type === 'assistant' && role === 'assistant') {
        const content = this.extractPlainText(this.getUnknownField(message, 'content'));
        this.pushAnthropicMessage(messages, 'assistant', content);
      }
    }

    if (!messages.length) {
      messages.push({ role: 'user', content: fallbackContent });
    }

    const recent = messages.slice(-maxHistoryMessages);
    while (recent.length && recent[0].role !== 'user') {
      recent.shift();
    }

    return recent.length ? recent : [{ role: 'user', content: fallbackContent }];
  }

  private pushAnthropicMessage(
    messages: AnthropicMessage[],
    role: AnthropicMessage['role'],
    content: string,
  ) {
    const text = content.trim();
    if (!text) {
      return;
    }

    const last = messages[messages.length - 1];
    if (last?.role === role) {
      last.content = `${last.content}\n\n${text}`;
      return;
    }

    messages.push({ role, content: text });
  }

  private extractPlainText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((block) => {
        if (typeof block === 'string') {
          return block;
        }

        if (typeof block !== 'object' || block === null) {
          return '';
        }

        const typedBlock = block as Record<string, unknown>;
        if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
          return typedBlock.text;
        }

        if (typedBlock.type === 'tool_result' && typeof typedBlock.content === 'string') {
          return typedBlock.content;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private extractAnthropicReply(responseBody: unknown): string {
    const body = this.asRecord(responseBody);
    const content = body?.content;

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .map((block) => {
        if (typeof block !== 'object' || block === null) {
          return '';
        }

        const typedBlock = block as Record<string, unknown>;
        return typedBlock.type === 'text' && typeof typedBlock.text === 'string'
          ? typedBlock.text
          : '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private extractAnthropicErrorMessage(responseBody: unknown): string | undefined {
    const body = this.asRecord(responseBody);
    const error = this.asRecord(body?.error);
    const message = this.getStringField(error, 'message');
    const type = this.getStringField(error, 'type');

    if (message && type) {
      return `${type}: ${message}`;
    }

    return message || this.getStringField(body, 'message');
  }

  private buildAnthropicMessagesEndpoint(baseUrl: string) {
    return baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
  }

  private normalizeBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  private tryParseJson(raw: string): unknown {
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private getUnknownField(value: unknown, key: string): unknown {
    return this.asRecord(value)?.[key];
  }

  private getStringField(value: unknown, key: string): string | undefined {
    const field = this.asRecord(value)?.[key];
    return typeof field === 'string' ? field : undefined;
  }

  private getRecordField(value: unknown, key: string): Record<string, unknown> | undefined {
    return this.asRecord(this.asRecord(value)?.[key]);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
