import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AgentCreateConversationInput {
  userId: string;
  title?: string;
  preview?: string;
}

export interface AgentConversationMetadata {
  conversationId: string;
  title: string;
  preview: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface AgentAttachmentInput {
  assetId: string;
  path: string;
  title?: string;
  mimeType?: string;
}

export interface AgentSendMessageInput {
  conversationId: string;
  userId: string;
  content: string;
  kind?: string;
  attachments?: AgentAttachmentInput[];
  context?: Record<string, unknown>;
  clientRequestId?: string;
}

export interface AgentSendMessageResult {
  accepted: boolean;
  status: 'queued' | 'processing' | 'done' | 'failed';
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  reply: string;
  file?: AgentAttachmentInput | AgentAttachmentInput[];
  raw?: Record<string, unknown>;
}

const networkRootDir = fileURLToPath(new URL('../../', import.meta.url));
const userDataRootDir = join(networkRootDir, 'user');

export async function createConversation(
  input: AgentCreateConversationInput,
): Promise<AgentConversationMetadata> {
  const timestamp = new Date().toISOString();
  const conversationId = randomUUID();
  const metadata: AgentConversationMetadata = {
    conversationId,
    title: input.title?.trim() || 'New Conversation',
    preview: input.preview?.trim() || '',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await ensureRuntimeSessionFile(input.userId, conversationId);
  return metadata;
}

export async function sendMessage(
  input: AgentSendMessageInput,
): Promise<AgentSendMessageResult> {
  const userMessageId = `msg_user_${randomUUID().replace(/-/g, '')}`;
  const assistantMessageId = `msg_assistant_${randomUUID().replace(/-/g, '')}`;
  const promptId = input.clientRequestId ?? randomUUID();
  const userEventUuid = randomUUID();
  const assistantThinkingUuid = randomUUID();
  const assistantReplyUuid = randomUUID();
  const now = new Date();
  const userTimestamp = now.toISOString();
  const thinkingTimestamp = new Date(now.getTime() + 300).toISOString();
  const replyTimestamp = new Date(now.getTime() + 700).toISOString();
  const reply = `Stub agent reply: ${input.content}`;

  await ensureRuntimeSessionFile(input.userId, input.conversationId);

  await appendRuntimeEvent(input.userId, input.conversationId, {
    parentUuid: null,
    isSidechain: false,
    promptId,
    type: 'user',
    message: {
      id: userMessageId,
      role: 'user',
      content: input.content,
    },
    uuid: userEventUuid,
    timestamp: userTimestamp,
    sessionId: input.conversationId,
  });

  await appendRuntimeEvent(input.userId, input.conversationId, {
    parentUuid: userEventUuid,
    isSidechain: false,
    type: 'assistant',
    message: {
      id: assistantMessageId,
      type: 'message',
      role: 'assistant',
      model: 'stub-agent',
      content: [
        {
          type: 'thinking',
          thinking: `Preparing a response for: ${input.content}`,
          signature: '',
        },
      ],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
    uuid: assistantThinkingUuid,
    timestamp: thinkingTimestamp,
    sessionId: input.conversationId,
  });

  await appendRuntimeEvent(input.userId, input.conversationId, {
    parentUuid: assistantThinkingUuid,
    isSidechain: false,
    type: 'assistant',
    message: {
      id: assistantMessageId,
      type: 'message',
      role: 'assistant',
      model: 'stub-agent',
      content: [
        {
          type: 'text',
          text: reply,
        },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
    uuid: assistantReplyUuid,
    timestamp: replyTimestamp,
    sessionId: input.conversationId,
  });

  return {
    accepted: true,
    status: 'done',
    conversationId: input.conversationId,
    userMessageId,
    assistantMessageId,
    reply,
    raw: {
      kind: input.kind ?? 'markdown',
      attachmentCount: input.attachments?.length ?? 0,
      context: input.context ?? {},
    },
  };
}

async function ensureRuntimeSessionFile(userId: string, conversationId: string) {
  const userDir = join(userDataRootDir, userId);
  const sessionFilePath = join(userDir, `${conversationId}.jsonl`);

  await mkdir(userDir, { recursive: true });

  try {
    await writeFile(sessionFilePath, '', { flag: 'wx' });
  } catch (error) {
    if (!isExistingFileError(error)) {
      throw error;
    }
  }
}

async function appendRuntimeEvent(
  userId: string,
  conversationId: string,
  payload: Record<string, unknown>,
) {
  const sessionFilePath = join(userDataRootDir, userId, `${conversationId}.jsonl`);
  await appendFile(sessionFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function isExistingFileError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}
