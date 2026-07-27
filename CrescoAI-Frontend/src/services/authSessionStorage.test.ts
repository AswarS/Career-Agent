import { afterEach, describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../config/runtime';
import { createAuthClient } from './authClient';
import { readStoredAuthSession, readStoredAuthTokenType, writeStoredAuthSession } from './authSessionStorage';

const storage = new Map<string, string>();

function installLocalStorage() {
  storage.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
}

afterEach(() => {
  storage.clear();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('authSessionStorage', () => {
  it('normalizes legacy stored sessions with missing token fields', () => {
    installLocalStorage();
    storage.set('career-agent-auth-session', JSON.stringify({
      user: {
        id: '1',
        email: 'user@example.com',
        displayName: '用户',
      },
      accessToken: 'access-token',
      expiresAt: null,
    }));

    expect(readStoredAuthSession()).toEqual({
      user: {
        id: '1',
        email: 'user@example.com',
        username: null,
        displayName: '用户',
      },
      accessToken: 'access-token',
      refreshToken: null,
      tokenType: 'Bearer',
      expiresAt: null,
      expiresIn: null,
    });
    expect(readStoredAuthTokenType()).toBe('Bearer');
  });

  it('round-trips full sessions', () => {
    installLocalStorage();
    writeStoredAuthSession({
      user: {
        id: '2',
        email: null,
        username: 'career_user',
        displayName: '职业用户',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: '2026-05-24T12:00:00.000Z',
      expiresIn: 7200,
    });

    expect(readStoredAuthSession()?.user.username).toBe('career_user');
    expect(readStoredAuthSession()?.refreshToken).toBe('refresh-token');
  });

  it('creates a token-free local session when upstream authentication is disabled', async () => {
    const client = createAuthClient(resolveRuntimeConfig({
      MODE: 'test',
      VITE_CAREER_AGENT_CLIENT_MODE: 'upstream',
      VITE_CAREER_AGENT_API_BASE_URL: 'http://localhost:4000',
      VITE_CAREER_AGENT_USER_ID: '42',
      VITE_CAREER_AGENT_SKIP_AUTH: 'true',
    }));

    const session = await client.login({ identifier: 'ignored', password: '' });

    expect(session.user.id).toBe('42');
    expect(session.accessToken).toBeNull();
    expect(session.refreshToken).toBeNull();
  });
});
