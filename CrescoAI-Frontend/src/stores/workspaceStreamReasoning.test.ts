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

function createClientWithEvents(events: ThreadMessageStreamEvent[]): CareerAgentClient {
  const client = createClient();
  async function* streamMessage(): AsyncGenerator<ThreadMessageStreamEvent> {
    for (const event of events) {
      yield event;
    }
  }

  return {
    ...client,
    streamMessage,
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

describe('workspace streamed block presentation', () => {
  afterEach(() => {
    vi.doUnmock('../services/createCareerAgentClient');
  });

  it('converts legacy streamed reasoning into status blocks when completion has no blocks payload', async () => {
    const workspaceStore = await createStoreWithClient(createClient());

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({
      content: '请解方程组',
      attachments: [],
    });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('x = 16/5, y = 11/5');
    expect(assistantMessage?.blocks?.map((block) => block.type)).toEqual(['status', 'text']);
    expect(assistantMessage?.blocks?.[0]?.text).toBe('正在分析题目条件。\n');
    expect(assistantMessage?.blocks?.[1]?.text).toBe('x = 16/5, y = 11/5');
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

  it('uses reply.delta as a fallback when an empty text block exists but no structured delta arrived', async () => {
    const workspaceStore = await createStoreWithClient(createClientWithEvents([
      {
        type: 'message.created',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      {
        type: 'message.block.completed',
        messageId: 'message-assistant',
        block: { id: 'text-0', type: 'text', text: '' },
      },
      {
        type: 'reply.delta',
        messageId: 'message-assistant',
        delta: 'opening text',
      },
      {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        reply: 'opening text',
      },
    ]));

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({ content: 'test', attachments: [] });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('opening text');
  });

  it('switches from legacy reply fallback to structured text without duplicating the prefix', async () => {
    const workspaceStore = await createStoreWithClient(createClientWithEvents([
      {
        type: 'message.created',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      { type: 'reply.delta', messageId: 'message-assistant', delta: 'open' },
      {
        type: 'message.block.delta',
        messageId: 'message-assistant',
        blockId: 'text-0',
        blockType: 'text',
        delta: 'opening',
        block: { id: 'text-0', type: 'text', text: '' },
      },
      { type: 'reply.delta', messageId: 'message-assistant', delta: 'ing' },
      {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        reply: 'opening',
      },
    ]));

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({ content: 'test', attachments: [] });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('opening');
    expect(assistantMessage?.blocks?.filter((block) => block.type === 'text')).toHaveLength(1);
  });

  it('replaces incomplete streamed text blocks with the completed reply', async () => {
    const workspaceStore = await createStoreWithClient(createClientWithEvents([
      {
        type: 'message.created',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      {
        type: 'message.block.delta',
        messageId: 'message-assistant',
        blockId: 'text-0',
        blockType: 'text',
        delta: 'Intermediate text',
        block: { id: 'text-0', type: 'text', text: '' },
      },
      {
        type: 'message.block.delta',
        messageId: 'message-assistant',
        blockId: 'text-1',
        blockType: 'text',
        delta: 'Incomplete final',
        block: { id: 'text-1', type: 'text', text: '' },
      },
      {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        reply: 'Authoritative final reply',
        blocks: [
          { id: 'text-0', type: 'text', text: 'Intermediate text' },
          { id: 'status-0', type: 'status', text: 'Execution detail' },
          { id: 'text-1', type: 'text', text: 'Incomplete final' },
        ],
      },
    ]));

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({ content: 'test', attachments: [] });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('Authoritative final reply');
    expect(assistantMessage?.blocks?.filter((block) => block.type === 'text')).toEqual([
      { id: 'text-0', type: 'text', text: 'Intermediate text' },
      { id: 'text-1', type: 'text', text: 'Authoritative final reply' },
    ]);
  });

  it('filters internal skill blocks from streamed presentation and completion payloads', async () => {
    const workspaceStore = await createStoreWithClient(createClientWithEvents([
      {
        type: 'message.created',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      {
        type: 'reasoning.delta',
        messageId: 'message-assistant',
        delta: 'Skill command selected: /learning-plan.\n',
      },
      {
        type: 'message.block.completed',
        messageId: 'message-assistant',
        block: {
          id: 'skill-learning-plan',
          type: 'skill',
          name: 'learning-plan',
          status: 'running',
          text: 'Skill command selected: /learning-plan.',
        },
      },
      {
        type: 'message.block.completed',
        messageId: 'message-assistant',
        block: {
          id: 'status-skill-0',
          type: 'status',
          text: 'Base directory for this skill: C:\\Users\\demo\\.codex\\skills\\learning-plan',
        },
      },
      {
        type: 'message.block.delta',
        messageId: 'message-assistant',
        blockId: 'text-0',
        blockType: 'text',
        delta: 'Final skill result',
        block: {
          id: 'text-0',
          type: 'text',
          text: '',
        },
      },
      {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        threadId: 'thread-001',
        messageId: 'message-user',
        assistantMessageId: 'message-assistant',
        reply: 'Final skill result',
        blocks: [
          {
            id: 'skill-learning-plan',
            type: 'skill',
            name: 'learning-plan',
            status: 'completed',
            text: 'Skill command selected: /learning-plan.',
          },
          {
            id: 'status-skill-0',
            type: 'status',
            text: 'Base directory for this skill: C:\\Users\\demo\\.codex\\skills\\learning-plan',
          },
          {
            id: 'text-0',
            type: 'text',
            text: 'Final skill result',
          },
        ],
      },
    ]));

    workspaceStore.activeThreadId = 'thread-001';
    await workspaceStore.submitDraftMessage({
      content: '/learning-plan',
      attachments: [],
    });

    const assistantMessage = workspaceStore.messages.find((message) => message.id === 'message-assistant');
    expect(assistantMessage?.content).toBe('Final skill result');
    expect(assistantMessage?.streaming).toBe(false);
    expect(assistantMessage?.reasoning).toBeNull();
    expect(assistantMessage?.blocks).toEqual([
      {
        id: 'skill-loaded-learning-plan',
        type: 'status',
        title: 'Skill',
        name: 'learning-plan',
        status: 'completed',
        text: 'Skill learning-plan loaded',
      },
      {
        id: 'text-0',
        type: 'text',
        text: 'Final skill result',
      },
    ]);
  });
});
