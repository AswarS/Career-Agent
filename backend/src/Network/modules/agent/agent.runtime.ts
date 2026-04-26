import { randomUUID } from 'node:crypto';

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

  return metadata;
}

export async function sendMessage(
  input: AgentSendMessageInput,
): Promise<AgentSendMessageResult> {
  const userMessageId = `msg_user_${randomUUID().replace(/-/g, '')}`;
  const assistantMessageId = `msg_assistant_${randomUUID().replace(/-/g, '')}`;
  const reply = `Stub agent reply: ${input.content}`;

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
