import { Injectable } from '@nestjs/common';
import {
  AgentConversationMetadata,
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentSendMessageResult,
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Per-conversation config persisted from createConversation */
interface ConversationConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

type QueryEngineInferenceResult =
  | {
      success: true;
      reply: string;
      thinking?: string;
      model?: string;
      usage?: Record<string, unknown>;
      durationMs?: number;
    }
  | {
      success: false;
      errorMessage?: string;
      retryable?: boolean;
    };

@Injectable()
export class AgentService {
  /** Per-conversation LLM config (apiKey / baseUrl / model) */
  private conversationConfigs = new Map<string, ConversationConfig>();
  /** Per-conversation QueryEngine instances (manages own message history) */
  private queryEngines = new Map<string, QueryEngine>();
  /** Per-conversation SessionContext for ALS routing */
  private sessionContexts = new Map<string, SessionContext>();

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
        content,
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

    // 3. Run inference via QueryEngine
    let qeResult = await this.runQueryEngineInference(
      conversationId,
      userId,
      content,
      mergedConfig,
    );

    if (!qeResult.success && qeResult.retryable) {
      this.resetConversationRuntime(conversationId);
      qeResult = await this.runQueryEngineInference(
        conversationId,
        userId,
        content,
        mergedConfig,
      );
    }

    if (qeResult.success) {
      const replyUuid = randomUUID();
      const replyTimestamp = new Date(now.getTime() + 500 + (qeResult.durationMs ?? 0)).toISOString();
      await appendJsonlEvent(userId, conversationId, {
        parentUuid: userEventUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          id: assistantMessageId,
          type: 'message',
          role: 'assistant',
          model: qeResult.model ?? 'unknown',
          content: [
            {
              type: 'text',
              text: qeResult.reply,
            },
          ],
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
        raw: {
          model: qeResult.model,
          usage: qeResult.usage,
          durationMs: qeResult.durationMs,
        },
      };
    }

    // 4. Fallback to stub if QueryEngine unavailable
    const stubReply = `Stub agent reply: ${content}`;
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
        model: 'stub-agent',
        content: [{ type: 'text', text: stubReply }],
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
      raw: {
        kind: input.kind ?? 'markdown',
        attachmentCount: input.attachments?.length ?? 0,
        context: input.context ?? {},
        fallback: true,
        error: qeResult.errorMessage,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private: real LLM inference via existing QueryEngine
  // -------------------------------------------------------------------------

  private async runQueryEngineInference(
    conversationId: string,
    userId: string,
    content: string,
    config: ConversationConfig,
  ): Promise<QueryEngineInferenceResult> {
    const startTime = Date.now();

    try {
      // Get or create per-conversation QueryEngine + SessionContext
      let queryEngine = this.queryEngines.get(conversationId);
      if (!queryEngine) {
        const ctx = this.buildSessionContext(conversationId, userId, config);
        this.sessionContexts.set(conversationId, ctx);
        queryEngine = createQueryEngineForSession(ctx);
        ctx.queryEngine = queryEngine;
        this.queryEngines.set(conversationId, queryEngine);
      }

      const ctx = this.sessionContexts.get(conversationId)!;

      // Run inside ALS context so all module-level helpers route correctly
      const result = await runWithSessionContext(ctx, async () => {
        const textParts: string[] = [];
        const thinkingParts: string[] = [];
        let model: string | undefined;

        const stream = queryEngine!.submitMessage(content);

        for await (const msg of stream) {
          const messageError = this.getApiErrorMessage(msg);
          if (messageError) {
            throw new Error(messageError);
          }

          // QueryEngine yields different event types:
          // - type=assistant: msg.message.content is content block array
          // - type=result: msg.result is the final text summary
          const msgMessage = (msg as any).message;
          if (msgMessage && Array.isArray(msgMessage.content)) {
            for (const block of msgMessage.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                textParts.push(block.text);
              }
              if (block.type === 'thinking' && typeof block.thinking === 'string') {
                thinkingParts.push(block.thinking);
              }
            }
            if (msgMessage.model && !model) {
              model = msgMessage.model;
            }
          }

          // Fallback: capture result text if no content blocks were extracted
          if ((msg as any).type === 'result' && typeof (msg as any).result === 'string' && !textParts.length) {
            textParts.push((msg as any).result);
          }
        }

        const reply = textParts.join('\n').trim();
        const thinking = thinkingParts.join('\n').trim();

        return { reply, thinking, model };
      });

      if (!result.reply) {
        console.error('[AgentService] QueryEngine returned empty reply');
        return { success: false };
      }

      return {
        success: true,
        reply: result.reply,
        thinking: result.thinking || undefined,
        model: result.model,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const errorMessage = err?.message ? String(err.message) : String(err);
      console.error('[AgentService] QueryEngine inference FAILED:', errorMessage);
      return {
        success: false,
        errorMessage,
        retryable: this.isRetryableInferenceError(errorMessage),
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
      this.resetConversationRuntime(conversationId);
    }
  }

  private resetConversationRuntime(conversationId: string) {
    const ctx = this.sessionContexts.get(conversationId);
    ctx?.abortController.abort();
    this.queryEngines.delete(conversationId);
    this.sessionContexts.delete(conversationId);
  }

  private normalizeConversationConfig(config: ConversationConfig): ConversationConfig {
    return {
      apiKey: config.apiKey?.trim() || undefined,
      baseUrl: config.baseUrl?.trim() || undefined,
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

  private getApiErrorMessage(message: unknown) {
    const value = message as {
      isApiErrorMessage?: boolean;
      apiError?: unknown;
      error?: unknown;
      errorDetails?: unknown;
      message?: { content?: unknown };
    };

    if (!value?.isApiErrorMessage && !value?.apiError && !value?.error) {
      return undefined;
    }

    const text = this.extractMessageText(value.message?.content);
    return (
      text ||
      (typeof value.errorDetails === 'string' ? value.errorDetails : undefined) ||
      (typeof value.error === 'string' ? value.error : undefined) ||
      (typeof value.apiError === 'string' ? value.apiError : undefined) ||
      'model api error'
    );
  }

  private extractMessageText(content: unknown) {
    if (typeof content === 'string') {
      return content;
    }

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

  private isRetryableInferenceError(errorMessage: string) {
    return errorMessage.includes('Content block is not a thinking block');
  }

  private buildSessionContext(
    conversationId: string,
    userId: string,
    config: ConversationConfig = {},
  ): SessionContext {
    return {
      sessionId: conversationId,
      userId,
      state: createIsolatedState({ sessionId: conversationId as any }),
      config: {
        cwd: process.cwd(),
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
}
