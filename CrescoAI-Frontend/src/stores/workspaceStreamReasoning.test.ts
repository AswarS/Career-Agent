import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerAgentClient } from '../services/careerAgentClient';
import { sanitizeProfileRecord } from '../services/upstreamContracts';
import type { ThreadMessageStreamEvent } from '../types/entities';

function createClient(): CareerAgentClient {
  async function* streamMessage(): AsyncGenerator<ThreadMessageStreamEvent> {
    yield {
      type: 'message.created' as const,
      threadId: 'thread-001',
      messageId: 'message-user',
      assistantMessageId: 'message-assistant',
      createdAt: '2026-04-20T00:00:00.000Z',
    };
    yield {
      type: 'reasoning.delta' as const,
      messageId: 'message-assistant',
      delta: '正在分析题目条件。\n',
    };
    yield {
      type: 'reply.delta' as const,
      messageId: 'message-assistant',
      delta: 'x = 16/5, y = 11/5',
    };
    yield {
      type: 'message.completed' as const,
      accepted: true,
      status: 'done',
      threadId: 'thread-001',
      messageId: 'message-user',
      assistantMessageId: 'message-assistant',
      reply: 'x = 16/5, y = 11/5',
    };
  }

  return {
    listThreads: vi.fn(async () => []),
    createThread: vi.fn(async () => ({
      id: 'thread-001',
      title: '新对话',
      preview: '',
      updatedAt: '2026-04-20T00:01:00.000Z',
      status: 'active' as const,
    })),
    deleteThread: vi.fn(async () => undefined),
    getThreadMessages: vi.fn(async () => {
      throw new Error('refresh failed');
    }),
    uploadThreadFile: vi.fn(),
    sendMessage: vi.fn(),
    streamMessage,
    getProfile: vi.fn(async () => sanitizeProfileRecord({})),
    updateProfile: vi.fn(async (profile) => profile),
    listProfileSuggestions: vi.fn(async () => []),
    listArtifacts: vi.fn(async () => []),
    getArtifact: vi.fn(async () => null),
    refreshArtifact: vi.fn(async () => null),
  };
}

async function createStoreWithClient(client: CareerAgentClient) {
  vi.resetModules();
  vi.doMock('../services/createCareerAgentClient', () => ({
    createCareerAgentClient: () => client,
  }));

  const { useWorkspaceStore } = await import('./workspace');
  setActivePinia(createPinia());
  return useWorkspaceStore();
}

describe('workspace streamed reasoning presentation', () => {
  afterEach(() => {
    vi.doUnmock('../services/createCareerAgentClient');
  });

  it('preserves streamed reasoning when completion has no reasoning payload', async () => {
    const workspaceStore = await createStoreWithClient(createClient());

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({
      content: '请解方程组',
      attachments: [],
    });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('x = 16/5, y = 11/5');
    expect(assistantMessage?.reasoning).toBe('正在分析题目条件。\n');
  });

  it('does not duplicate streamed reply text when completion repeats the final reply', async () => {
    const workspaceStore = await createStoreWithClient(createClient());

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({
      content: '请解方程组',
      attachments: [],
    });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).not.toBe('x = 16/5, y = 11/5x = 16/5, y = 11/5');
  });
});
