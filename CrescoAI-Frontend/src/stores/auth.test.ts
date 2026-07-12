import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../types/entities';

const session: AuthSession = {
  user: {
    id: '42',
    email: 'user@example.com',
    username: 'user-42',
    displayName: 'User 42',
  },
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  expiresAt: null,
  expiresIn: null,
};

describe('auth store logout', () => {
  afterEach(() => {
    vi.doUnmock('../services/authClient');
    vi.resetModules();
  });

  it('clears the active session instead of recreating a default user', async () => {
    const logout = vi.fn(async () => undefined);
    vi.doMock('../services/authClient', () => ({
      createAuthClient: () => ({ logout }),
    }));

    const { useAuthStore } = await import('./auth');
    setActivePinia(createPinia());
    const authStore = useAuthStore();
    authStore.setSession(session);

    await authStore.logout();

    expect(logout).toHaveBeenCalledOnce();
    expect(authStore.session).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.initialized).toBe(true);
    expect(authStore.status).toBe('ready');
  });
});
