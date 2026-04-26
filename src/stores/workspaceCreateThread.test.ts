import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerAgentClient } from '../services/careerAgentClient';
import type { ThreadMessage } from '../types/entities';

function createClient(overrides: Partial<CareerAgentClient> = {}): CareerAgentClient {
  return {
    listThreads: vi.fn(async () => [
      {
        id: '1',
        title: '问好',
        preview: '你好',
        updatedAt: '2026-04-20T00:00:00.000Z',
        status: 'active' as const,
      },
    ]),
    createThread: vi.fn(async () => ({
      id: '2',
      title: '新对话',
      preview: '',
      updatedAt: '2026-04-20T00:01:00.000Z',
      status: 'active' as const,
    })),
    getThreadMessages: vi.fn(async () => []),
    uploadThreadFile: vi.fn(async () => ({
      assetId: 'asset-test',
      kind: 'file' as const,
      url: '/api/career-agent/threads/2/files/resume.pdf',
      title: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      createdAt: '2026-04-20T00:00:00.000Z',
      storagePath: '/api/career-agent/threads/2/files/resume.pdf',
      storedFileName: 'resume.pdf',
      originalName: 'resume.pdf',
    })),
    sendMessage: vi.fn(async () => ({
      accepted: true,
      messageId: 'message-user',
      assistantMessageId: 'message-assistant',
      status: 'done',
    })),
    getProfile: vi.fn(async () => ({
      displayName: '',
      locale: 'zh-CN',
      timezone: 'Asia/Singapore',
      currentRole: '',
      employmentStatus: '',
      experienceSummary: '',
      educationSummary: '',
      locationRegion: '',
      targetRole: '',
      targetIndustries: [],
      shortTermGoal: '',
      longTermGoal: '',
      weeklyTimeBudget: '',
      constraints: [],
      workPreferences: [],
      learningPreferences: [],
      keyStrengths: [],
      riskSignals: [],
      portfolioLinks: [],
    })),
    updateProfile: vi.fn(async (profile) => profile),
    listProfileSuggestions: vi.fn(async () => []),
    listArtifacts: vi.fn(async () => []),
    getArtifact: vi.fn(async () => null),
    refreshArtifact: vi.fn(async () => null),
    ...overrides,
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

describe('useWorkspaceStore createThread upstream state', () => {
  afterEach(() => {
    vi.doUnmock('../services/createCareerAgentClient');
  });

  it('sets create status to error when upstream thread creation fails', async () => {
    const client = createClient({
      createThread: vi.fn(async () => {
        throw new Error('create failed');
      }),
    });
    const workspaceStore = await createStoreWithClient(client);

    await expect(workspaceStore.createThread()).rejects.toThrow('create failed');

    expect(workspaceStore.threadCreateStatus).toBe('error');
    expect(workspaceStore.errorMessage).toBe('create failed');
    expect(workspaceStore.activeThreadId).toBe('1');
  });

  it('passes the first draft summary into upstream thread creation', async () => {
    const client = createClient();
    const workspaceStore = await createStoreWithClient(client);

    const nextThread = await workspaceStore.startThreadFromDraft({
      content: '请帮我做一份新的周计划',
      attachments: [],
    });

    expect(nextThread?.id).toBe('2');
    expect(client.createThread).toHaveBeenCalledTimes(1);
    expect(client.createThread).toHaveBeenCalledWith({
      title: '请帮我做一份新的周计划',
      preview: '请帮我做一份新的周计划',
    });
    expect(workspaceStore.threadCreateStatus).toBe('ready');
  });

  it('uploads attachments, sends the message, and replaces pending messages with server history', async () => {
    const serverMessages: ThreadMessage[] = [
      {
        id: 'message-user',
        threadId: '1',
        role: 'user',
        kind: 'markdown',
        content: '请分析附件',
        files: [
          {
            id: 'asset-test',
            name: 'resume.pdf',
            url: '/api/career-agent/threads/1/files/resume.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1,
          },
        ],
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 'message-assistant',
        threadId: '1',
        role: 'assistant',
        kind: 'markdown',
        content: '已分析。',
        createdAt: '2026-04-20T00:00:01.000Z',
      },
    ];
    const client = createClient({
      getThreadMessages: vi.fn(async () => serverMessages),
    });
    const workspaceStore = await createStoreWithClient(client);

    workspaceStore.activeThreadId = '1';
    await workspaceStore.submitDraftMessage({
      content: '请分析附件',
      attachments: [
        {
          id: 'local-file',
          kind: 'file',
          name: 'resume.pdf',
          url: 'blob:http://localhost/resume',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ],
    });

    expect(client.uploadThreadFile).toHaveBeenCalledWith('1', expect.objectContaining({
      name: 'resume.pdf',
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('1', expect.objectContaining({
      content: '请分析附件',
      attachmentAssetIds: ['asset-test'],
    }));
    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messageSubmitStatus).toBe('ready');
    expect(workspaceStore.messages).toEqual(serverMessages);
  });

  it('keeps the pending message and exposes an error when sending fails', async () => {
    const client = createClient({
      sendMessage: vi.fn(async () => {
        throw new Error('send failed');
      }),
    });
    const workspaceStore = await createStoreWithClient(client);

    workspaceStore.activeThreadId = '1';
    await workspaceStore.submitDraftMessage({
      content: '请分析附件',
      attachments: [],
    });

    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messageSubmitStatus).toBe('error');
    expect(workspaceStore.errorMessage).toBe('send failed');
    expect(workspaceStore.messages[0]).toMatchObject({
      role: 'user',
      content: '请分析附件',
    });
    expect(workspaceStore.messages[1]).toMatchObject({
      role: 'system',
      content: '消息发送失败：send failed',
    });
  });

  it('keeps the pending message when the server rejects the send acknowledgement', async () => {
    const client = createClient({
      sendMessage: vi.fn(async () => ({
        accepted: false,
        messageId: 'message-user',
        assistantMessageId: '',
        status: 'failed',
      })),
    });
    const workspaceStore = await createStoreWithClient(client);

    workspaceStore.activeThreadId = '1';
    await workspaceStore.submitDraftMessage({
      content: '请分析附件',
      attachments: [],
    });

    expect(client.getThreadMessages).not.toHaveBeenCalledWith('1');
    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messageSubmitStatus).toBe('error');
    expect(workspaceStore.errorMessage).toBe('消息未被服务端接受');
    expect(workspaceStore.messages[1]).toMatchObject({
      role: 'system',
      content: '消息发送失败：消息未被服务端接受',
    });
  });

  it('keeps the pending message when refreshing server history fails after send', async () => {
    const client = createClient({
      getThreadMessages: vi.fn(async () => {
        throw new Error('refresh failed');
      }),
    });
    const workspaceStore = await createStoreWithClient(client);

    workspaceStore.activeThreadId = '1';
    await workspaceStore.submitDraftMessage({
      content: '请分析附件',
      attachments: [],
    });

    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messageSubmitStatus).toBe('error');
    expect(workspaceStore.errorMessage).toBe('refresh failed');
    expect(workspaceStore.messages[1]).toMatchObject({
      role: 'system',
      content: '消息已发送，但刷新消息列表失败：refresh failed',
    });
  });

  it('surfaces upload failures before sending the message', async () => {
    const client = createClient({
      uploadThreadFile: vi.fn(async () => {
        throw new Error('upload failed');
      }),
    });
    const workspaceStore = await createStoreWithClient(client);

    workspaceStore.activeThreadId = '1';
    await workspaceStore.submitDraftMessage({
      content: '',
      attachments: [
        {
          id: 'local-file',
          kind: 'file',
          name: 'resume.pdf',
          url: 'blob:http://localhost/resume',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      ],
    });

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messageSubmitStatus).toBe('error');
    expect(workspaceStore.errorMessage).toBe('upload failed');
  });
});
