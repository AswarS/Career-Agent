import { describe, expect, it, vi } from 'vitest';
import { createCareerAgentClient } from './createCareerAgentClient';
import type { CareerAgentClient } from './careerAgentClient';

function createStubClient(): CareerAgentClient {
  return {
    listThreads: vi.fn(async () => []),
    createThread: vi.fn(async () => ({
      id: 'thread-new',
      title: '新对话',
      preview: '',
      updatedAt: '2026-04-20T00:00:00.000Z',
      status: 'active' as const,
    })),
    getThreadMessages: vi.fn(async () => []),
    uploadThreadFile: vi.fn(async () => ({
      assetId: 'asset-test',
      kind: 'file' as const,
      url: '/api/career-agent/threads/thread-new/files/resume.pdf',
      title: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      createdAt: '2026-04-20T00:00:00.000Z',
      storagePath: '/api/career-agent/threads/thread-new/files/resume.pdf',
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
      displayName: 'Biter',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
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
  };
}

describe('createCareerAgentClient', () => {
  it('uses the mock factory in mock mode', () => {
    const mockClient = createStubClient();
    const mockFactory = vi.fn(() => mockClient);
    const upstreamFactory = vi.fn(() => createStubClient());

    const client = createCareerAgentClient({
      config: {
        environmentName: 'test',
        clientMode: 'mock',
        apiBaseUrl: null,
        userId: '1',
        upstreamWithCredentials: false,
        artifactTransport: 'mock',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
        htmlAppExampleUrl: null,
        nodeAppExampleUrl: null,
        upstreamConfigured: false,
      },
      mockFactory,
      upstreamFactory,
    });

    expect(client).toBe(mockClient);
    expect(mockFactory).toHaveBeenCalledOnce();
    expect(upstreamFactory).not.toHaveBeenCalled();
  });

  it('uses the upstream factory when upstream mode is configured', () => {
    const upstreamClient = createStubClient();
    const upstreamFactory = vi.fn(() => upstreamClient);

    const client = createCareerAgentClient({
      config: {
        environmentName: 'test',
        clientMode: 'upstream',
        apiBaseUrl: 'https://agent.example.com',
        userId: '42',
        upstreamWithCredentials: true,
        artifactTransport: 'polling',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
        htmlAppExampleUrl: null,
        nodeAppExampleUrl: null,
        upstreamConfigured: true,
      },
      upstreamFactory,
    });

    expect(client).toBe(upstreamClient);
    expect(upstreamFactory).toHaveBeenCalledWith({
      baseUrl: 'https://agent.example.com',
      userId: '42',
      withCredentials: true,
    });
  });

  it('returns an unavailable client when upstream mode has no base URL', async () => {
    const client = createCareerAgentClient({
      config: {
        environmentName: 'test',
        clientMode: 'upstream',
        apiBaseUrl: null,
        userId: '1',
        upstreamWithCredentials: false,
        artifactTransport: 'polling',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
        htmlAppExampleUrl: null,
        nodeAppExampleUrl: null,
        upstreamConfigured: false,
      },
    });

    await expect(client.listThreads()).rejects.toThrow(
      'Career agent client mode is set to upstream, but VITE_CAREER_AGENT_API_BASE_URL is empty.',
    );
  });
});
