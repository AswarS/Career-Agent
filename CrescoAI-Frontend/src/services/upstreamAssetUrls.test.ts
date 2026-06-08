import { describe, expect, it } from 'vitest';
import { resolveUpstreamAssetUrl } from './upstreamAssetUrls';

const upstreamConfig = {
  environmentName: 'test',
  clientMode: 'upstream' as const,
  apiBaseUrl: 'http://127.0.0.1:4000',
  userId: '1',
  upstreamWithCredentials: false,
  artifactTransport: 'polling' as const,
  voiceInputEnabled: false,
  trustedCanvasOrigins: [],
  nodeCanvasFixtureUrl: null,
  htmlAppExampleUrl: null,
  nodeAppExampleUrl: null,
  upstreamConfigured: true,
  skipAuth: false,
};

describe('resolveUpstreamAssetUrl', () => {
  it('keeps absolute urls unchanged', () => {
    expect(resolveUpstreamAssetUrl('https://example.com/file.png', upstreamConfig)).toBe('https://example.com/file.png');
  });

  it('rewrites backend relative asset paths onto the configured upstream base url', () => {
    expect(resolveUpstreamAssetUrl('/api/career-agent/threads/1/files/readme.md', upstreamConfig))
      .toBe('http://127.0.0.1:4000/api/career-agent/threads/1/files/readme.md');
  });

  it('leaves relative paths unchanged when upstream mode is not configured', () => {
    expect(resolveUpstreamAssetUrl('/mock-media/test_image.png', {
      ...upstreamConfig,
      clientMode: 'mock',
      apiBaseUrl: null,
      upstreamConfigured: false,
    })).toBe('/mock-media/test_image.png');
  });
});
