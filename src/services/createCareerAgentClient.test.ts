import { describe, expect, it, vi } from 'vitest';
import { createCareerAgentClient } from './createCareerAgentClient';
import type { CareerAgentClient } from './careerAgentClient';

function createStubClient(): CareerAgentClient {
  return {
    listThreads: vi.fn(async () => []),
    getThreadMessages: vi.fn(async () => []),
    getProfile: vi.fn(async () => ({
      displayName: 'Fancy',
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
        artifactTransport: 'mock',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
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
        artifactTransport: 'polling',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
        upstreamConfigured: true,
      },
      upstreamFactory,
    });

    expect(client).toBe(upstreamClient);
    expect(upstreamFactory).toHaveBeenCalledWith({
      baseUrl: 'https://agent.example.com',
      fetcher: undefined,
    });
  });

  it('returns an unavailable client when upstream mode has no base URL', async () => {
    const client = createCareerAgentClient({
      config: {
        environmentName: 'test',
        clientMode: 'upstream',
        apiBaseUrl: null,
        artifactTransport: 'polling',
        voiceInputEnabled: false,
        trustedCanvasOrigins: [],
        nodeCanvasFixtureUrl: null,
        upstreamConfigured: false,
      },
    });

    await expect(client.listThreads()).rejects.toThrow(
      'Career agent client mode is set to upstream, but VITE_CAREER_AGENT_API_BASE_URL is empty.',
    );
  });
});
