import { describe, expect, it } from 'vitest';
import { resolveTrustedCanvasOrigins, resolveTrustedCanvasUrl } from './urlCanvasPolicy';

describe('resolveTrustedCanvasUrl', () => {
  it('allows same-origin relative URLs', () => {
    expect(resolveTrustedCanvasUrl('/mock-node-canvas/index.html', {
      currentOrigin: 'http://127.0.0.1:4173',
      trustedOrigins: [],
    })).toBe('http://127.0.0.1:4173/mock-node-canvas/index.html');
  });

  it('allows absolute URLs from trusted origins', () => {
    expect(resolveTrustedCanvasUrl('https://canvas.example.com/app', {
      currentOrigin: 'http://127.0.0.1:4173',
      trustedOrigins: ['https://canvas.example.com'],
    })).toBe('https://canvas.example.com/app');
  });

  it('rejects unsafe protocols and untrusted origins', () => {
    expect(resolveTrustedCanvasUrl('javascript:alert(1)', {
      currentOrigin: 'http://127.0.0.1:4173',
      trustedOrigins: [],
    })).toBeNull();

    expect(resolveTrustedCanvasUrl('https://evil.example.com/app', {
      currentOrigin: 'http://127.0.0.1:4173',
      trustedOrigins: ['https://canvas.example.com'],
    })).toBeNull();
  });
});

describe('resolveTrustedCanvasOrigins', () => {
  it('adds the upstream backend origin automatically in upstream mode', () => {
    expect(resolveTrustedCanvasOrigins({
      configured: [],
      apiBaseUrl: 'http://localhost:4000',
      upstreamConfigured: true,
    })).toEqual(['http://localhost:4000']);
  });

  it('keeps only configured origins without an upstream backend', () => {
    expect(resolveTrustedCanvasOrigins({
      configured: ['https://canvas.example.com'],
      apiBaseUrl: null,
      upstreamConfigured: false,
    })).toEqual(['https://canvas.example.com']);
  });

  it('does not duplicate an already configured backend origin', () => {
    expect(resolveTrustedCanvasOrigins({
      configured: ['http://localhost:4000'],
      apiBaseUrl: 'http://localhost:4000/',
      upstreamConfigured: true,
    })).toEqual(['http://localhost:4000']);
  });

  it('ignores a malformed apiBaseUrl', () => {
    expect(resolveTrustedCanvasOrigins({
      configured: [],
      apiBaseUrl: 'not-a-url',
      upstreamConfigured: true,
    })).toEqual([]);
  });
});
