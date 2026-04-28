import { Injectable } from '@nestjs/common';
import {
  AgentConversationMetadata,
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentSendMessageResult,
  createConversation,
} from './agent.runtime';
import { QueryEngine } from '../../../QueryEngine.js';
import {
  createQueryEngineForSession,
  createServerAppState,
} from '../../../server/queryEngineFactory.js';
import {
  runWithSessionContext,
  type SessionContext,
} from '../../../server/SessionContext.js';
import { createIsolatedState } from '../../../bootstrap/state.js';
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

@Injectable()
export class AgentService {
  /** Per-conversation QueryEngine instances to preserve multi-turn history */
  private queryEngines = new Map<string, QueryEngine>();
  /** Per-conversation LLM config (apiKey / baseUrl / model) */
  private conversationConfigs = new Map<string, ConversationConfig>();

  async createConversation(
    input: AgentCreateConversationInput,
  ): Promise<AgentConversationMetadata> {
    const meta = await createConversation(input);
    // Store config for later QueryEngine creation
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

    // 2. Try real LLM inference via QueryEngine
    // Merge: message-level override > conversation-level config
    const convCfg = this.conversationConfigs.get(conversationId);
    const mergedConfig: ConversationConfig = {
      apiKey: input.apiKey ?? convCfg?.apiKey,
      baseUrl: input.baseUrl ?? convCfg?.baseUrl,
      model: input.model ?? convCfg?.model,
    };
    const qeResult = await this.tryRealInference(conversationId, userId, content, mergedConfig);

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
          content: [
            {
              type: 'thinking',
              thinking: qeResult.thinking ?? '',
              signature: '',
            },
          ],
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

    // 3. Fallback to stub if QueryEngine unavailable
    const stubReply = `Stub agent reply: ${content}`;
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
        content: [{ type: 'thinking', thinking: `Preparing a response for: ${content}`, signature: '' }],
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
      },
    };
  }

  // -------------------------------------------------------------------------
  // Private: real LLM inference via QueryEngine
  // -------------------------------------------------------------------------

  private async tryRealInference(
    conversationId: string,
    userId: string,
    content: string,
    config: ConversationConfig,
  ): Promise<
    | {
        success: true;
        reply: string;
        thinking?: string;
        model?: string;
        usage?: Record<string, unknown>;
        durationMs?: number;
      }
    | { success: false }
  > {
    let qe: QueryEngine;
    try {
      qe = await this.getOrCreateQueryEngine(conversationId, userId, config);
    } catch (qeError: any) {
      // QueryEngine creation failed — log the actual error
      console.error('[AgentService] getOrCreateQueryEngine FAILED:', qeError?.message ?? qeError);
      console.error('[AgentService] getOrCreateQueryEngine stack:', qeError?.stack);
      return { success: false };
    }

    const startTime = Date.now();
    let reply = '';
    let thinking = '';
    let model: string | undefined;
    let usage: Record<string, unknown> | undefined;

    try {
      const ctx = this.buildSessionContext(conversationId, userId, config);
      await runWithSessionContext(ctx, async () => {
        for await (const event of qe.submitMessage(content)) {
          // Extract text from assistant content blocks
          if (event.type === 'assistant') {
            const message = event.message as any;
            if (message?.model) model = message.model;
            if (message?.usage) usage = message.usage;

            const contentBlocks: any[] = Array.isArray(message?.content)
              ? message.content
              : [];

            for (const block of contentBlocks) {
              if (block.type === 'text' && typeof block.text === 'string') {
                reply += block.text;
              }
              if (block.type === 'thinking' && typeof block.thinking === 'string') {
                thinking += block.thinking;
              }
            }
          }

          // Extract usage from result event
          if (event.type === 'result') {
            const result = event as any;
            if (result.usage) usage = result.usage;
            if (result.model) model = result.model;
          }
        }
      });
    } catch (err: any) {
      // Log the actual submitMessage error
      console.error('[AgentService] submitMessage FAILED:', err?.message ?? err);
      console.error('[AgentService] submitMessage stack:', err?.stack);
      // If we got a partial reply, return it; otherwise treat as failure
      if (!reply) {
        return { success: false };
      }
    }

    if (!reply && !thinking) {
      return { success: false };
    }

    return {
      success: true,
      reply: reply || '(no text reply)',
      thinking: thinking || undefined,
      model,
      usage,
      durationMs: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // Private: QueryEngine lifecycle
  // -------------------------------------------------------------------------

  private async getOrCreateQueryEngine(
    conversationId: string,
    userId: string,
    config: ConversationConfig,
  ): Promise<QueryEngine> {
    const existing = this.queryEngines.get(conversationId);
    if (existing) return existing;

    const ctx = this.buildSessionContext(conversationId, userId, config);
    const qe = createQueryEngineForSession(ctx as any);

    this.queryEngines.set(conversationId, qe);
    return qe;
  }

  private buildSessionContext(
    conversationId: string,
    userId: string,
    config: ConversationConfig = {},
  ): SessionContext {
    const { getAppState } = createServerAppState();
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
