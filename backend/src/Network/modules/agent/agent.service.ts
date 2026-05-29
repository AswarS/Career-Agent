import { Injectable, Optional } from '@nestjs/common';
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
import { SettingsService } from '../settings/settings.service';

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
  }): Promise<{ success: boolean; reply?: string; thinking?: string; model?: string }> {
    const tempConversationId =
      input.conversationId && input.conversationId.trim().length > 0
        ? `${input.conversationId}-skill`
        : `skill-${randomUUID()}`;

    try {
      const result = await this.runQueryEngineInference(
        tempConversationId,
        input.userId,
        input.content,
        {
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model: input.model,
        },
      );

      if (!result.success) return { success: false };
      return {
        success: true,
        reply: result.reply,
        thinking: result.thinking,
        model: result.model,
      };
    } finally {
      this.queryEngines.delete(tempConversationId);
      this.sessionContexts.delete(tempConversationId);
      this.conversationConfigs.delete(tempConversationId);
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

    // 2. Merge config: message-level override > conversation-level config > user-level settings
    const convCfg = this.conversationConfigs.get(conversationId);
    let userSettings: ConversationConfig = {};
    if (this.settingsService) {
      const saved = await this.settingsService.getSettings(Number(userId));
      if (saved) {
        userSettings = { apiKey: saved.apiKey ?? undefined, baseUrl: saved.baseUrl ?? undefined, model: saved.model ?? undefined };
      }
    }
    const mergedConfig: ConversationConfig = {
      apiKey: input.apiKey ?? convCfg?.apiKey ?? userSettings.apiKey,
      baseUrl: input.baseUrl ?? convCfg?.baseUrl ?? userSettings.baseUrl,
      model: input.model ?? convCfg?.model ?? userSettings.model,
    };

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

    // 4. Fallback to stub if QueryEngine unavailable
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
  // Private: real LLM inference via existing QueryEngine
  // -------------------------------------------------------------------------

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
      }
    | { success: false }
  > {
    const startTime = Date.now();

    try {
      const userWorkspaceDir = join(userDataRootDir, String(userId));
      const userWorkspaceRelativeDir = `./src/Network/user/${String(userId)}`;
      await mkdir(userWorkspaceDir, { recursive: true });

      // Get or create per-conversation QueryEngine + SessionContext
      let queryEngine = this.queryEngines.get(conversationId);
      if (!queryEngine) {
        const ctx = this.buildSessionContext(
          conversationId,
          userId,
          config,
          userWorkspaceRelativeDir,
        );
        this.sessionContexts.set(conversationId, ctx);
        queryEngine = createQueryEngineForSession(ctx);
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

              if ((msg as any).type === 'result' && typeof (msg as any).result === 'string' && !textParts.length) {
                textParts.push((msg as any).result);
              }
            }

            const reply = textParts.join('\n').trim();
            const thinking = thinkingParts.join('\n').trim();

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
        }
      })();

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
      console.error('[AgentService] QueryEngine inference FAILED:', err?.message ?? err);
      return { success: false };
    }
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
