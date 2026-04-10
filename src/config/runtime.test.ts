import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from './runtime';

describe('resolveRuntimeConfig', () => {
  it('defaults to mock runtime when env values are absent', () => {
    const config = resolveRuntimeConfig({});

    expect(config).toEqual({
      environmentName: 'development',
      clientMode: 'mock',
      apiBaseUrl: null,
      artifactTransport: 'mock',
      voiceInputEnabled: false,
      trustedCanvasOrigins: [],
      nodeCanvasFixtureUrl: null,
      upstreamConfigured: false,
    });
  });

  it('normalizes upstream values and trims trailing slashes', () => {
    const config = resolveRuntimeConfig({
      MODE: 'production',
      VITE_CAREER_AGENT_CLIENT_MODE: 'upstream',
      VITE_CAREER_AGENT_API_BASE_URL: 'https://agent.example.com///',
      VITE_CAREER_AGENT_ARTIFACT_TRANSPORT: 'sse',
      VITE_CAREER_AGENT_ENABLE_VOICE_INPUT: 'true',
      VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS:
        'https://canvas.example.com, invalid, https://canvas.example.com/path, http://localhost:3000',
      VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL: 'http://127.0.0.1:4318',
    });

    expect(config).toEqual({
      environmentName: 'production',
      clientMode: 'upstream',
      apiBaseUrl: 'https://agent.example.com',
      artifactTransport: 'sse',
      voiceInputEnabled: true,
      trustedCanvasOrigins: ['https://canvas.example.com', 'http://localhost:3000'],
      nodeCanvasFixtureUrl: 'http://127.0.0.1:4318',
      upstreamConfigured: true,
    });
  });

  it('falls back to polling for invalid upstream transport values', () => {
    const config = resolveRuntimeConfig({
      VITE_CAREER_AGENT_CLIENT_MODE: 'upstream',
      VITE_CAREER_AGENT_API_BASE_URL: 'https://agent.example.com',
      VITE_CAREER_AGENT_ARTIFACT_TRANSPORT: 'invalid',
    });

    expect(config.artifactTransport).toBe('polling');
  });
});
