import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerAgentClient } from '../services/careerAgentClient';

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
});
