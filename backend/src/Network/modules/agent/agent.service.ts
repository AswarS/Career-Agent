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
  /** Per-conversation LLM config (apiKey / baseUrl / model) */
  private conversationConfigs = new Map<string, ConversationConfig>();
  /** Per-conversation message history for multi-turn */
  private conversationHistories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

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
    const apiKey = config.apiKey;
    const baseUrl = config.baseUrl;
    const model = config.model;

    if (!apiKey || !baseUrl) {
      console.error('[AgentService] No apiKey/baseUrl configured, skipping real inference');
      return { success: false };
    }

    const startTime = Date.now();
    let reply = '';

    try {
      // Get or create per-conversation message history
      let history = this.conversationHistories.get(conversationId);
      if (!history) {
        history = [];
        this.conversationHistories.set(conversationId, history);
      }

      // Append user message
      history.push({ role: 'user', content });

      // Build OpenAI-compatible chat completions request URL
      const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model ?? 'deepseek-chat',
          messages: history,
          max_tokens: 4096,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[AgentService] API ${response.status}: ${errBody}`);
        // Remove failed user message from history
        history.pop();
        return { success: false };
      }

      const data = await response.json() as any;
      const choice = data.choices?.[0];
      if (choice?.message?.content) {
        reply = choice.message.content;
      }

      // Append assistant reply to history for multi-turn
      if (reply) {
        history.push({ role: 'assistant', content: reply });
      }

      return {
        success: true,
        reply: reply || '(no text reply)',
        model: data.model ?? model,
        usage: data.usage as Record<string, unknown> | undefined,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.error('[AgentService] API call FAILED:', err?.message ?? err);
      if (!reply) {
        return { success: false };
      }
      return {
        success: true,
        reply,
        model,
        durationMs: Date.now() - startTime,
      };
    }
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
