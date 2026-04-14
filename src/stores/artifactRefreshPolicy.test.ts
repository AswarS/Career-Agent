import { describe, expect, it } from 'vitest';
import { shouldSimulateArtifactRefreshLifecycle } from './artifactRefreshPolicy';

describe('shouldSimulateArtifactRefreshLifecycle', () => {
  it('enables simulated refresh lifecycle for mock transport', () => {
    expect(shouldSimulateArtifactRefreshLifecycle({
      environmentName: 'test',
      clientMode: 'mock',
      apiBaseUrl: null,
      artifactTransport: 'mock',
      voiceInputEnabled: false,
      trustedCanvasOrigins: [],
      nodeCanvasFixtureUrl: null,
      htmlAppExampleUrl: null,
      nodeAppExampleUrl: null,
      upstreamConfigured: false,
    })).toBe(true);
  });

  it('disables simulated refresh lifecycle for upstream transports', () => {
    expect(shouldSimulateArtifactRefreshLifecycle({
      environmentName: 'test',
      clientMode: 'upstream',
      apiBaseUrl: 'https://agent.example.com',
      artifactTransport: 'polling',
      voiceInputEnabled: false,
      trustedCanvasOrigins: [],
      nodeCanvasFixtureUrl: null,
      htmlAppExampleUrl: null,
      nodeAppExampleUrl: null,
      upstreamConfigured: true,
    })).toBe(false);
  });
});
