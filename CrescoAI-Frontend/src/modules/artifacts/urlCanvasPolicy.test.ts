import { describe, expect, it } from 'vitest';
import { resolveTrustedCanvasUrl } from './urlCanvasPolicy';

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
