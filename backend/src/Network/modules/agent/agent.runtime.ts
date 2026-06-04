import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AgentCreateConversationInput {
  userId: string;
  title?: string;
  preview?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
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
  /** Per-message override, falls back to conversation-level config */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface GeneratedFile {
  path: string;
  kind: 'image' | 'video' | 'html' | 'app' | 'file';
  title?: string;
}

export interface AgentSendMessageResult {
  accepted: boolean;
  status: 'queued' | 'processing' | 'done' | 'failed';
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  reply: string;
  file?: AgentAttachmentInput | AgentAttachmentInput[];
  generatedFiles?: GeneratedFile[];
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

export { ensureRuntimeSessionFile, appendRuntimeEvent }

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
