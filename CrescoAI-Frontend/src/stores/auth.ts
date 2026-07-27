import { defineStore } from 'pinia';
import { createAuthClient } from '../services/authClient';
import { readStoredAuthSession, writeStoredAuthSession } from '../services/authSessionStorage';
import { runtimeConfig } from '../config/runtime';
import type { AuthSession, LoadState, LoginCredentials, RegisterCredentials } from '../types/entities';

const authClient = createAuthClient();
let initializePromise: Promise<void> | null = null;

interface AuthState {
  initialized: boolean;
  session: AuthSession | null;
  status: LoadState;
  errorMessage: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    initialized: false,
    session: readStoredAuthSession(),
    status: 'idle',
    errorMessage: null,
  }),
  getters: {
    isAuthenticated(state) {
      return Boolean(state.session);
    },
    user(state) {
      return state.session?.user ?? null;
    },
  },
  actions: {
    setSession(session: AuthSession | null) {
      this.session = session;
      writeStoredAuthSession(session);
    },
    async initialize() {
      if (this.initialized) {
        return;
      }

      if (initializePromise) {
        await initializePromise;
        return;
      }

      initializePromise = (async () => {
        this.status = 'loading';
        this.errorMessage = null;

        try {
          if (runtimeConfig.skipAuth) {
            // Always replace a stale authenticated session so upstream requests do not
            // accidentally keep sending an expired token while auth is disabled.
            const localSession = await authClient.login({ identifier: runtimeConfig.userId, password: '' });
            this.setSession(localSession);
            this.status = 'ready';
            this.initialized = true;
            return;
          }

          const storedSession = readStoredAuthSession();

          if (!storedSession) {
            this.setSession(null);
            this.status = 'ready';
            this.initialized = true;
            return;
          }

          const verifiedSession = await authClient.getSession();
          const nextSession = verifiedSession ?? await authClient.refreshSession();

          this.setSession(nextSession);
          this.status = 'ready';
          this.initialized = true;
        } catch (error) {
          this.setSession(null);
          this.status = 'error';
          this.errorMessage = error instanceof Error ? error.message : '认证状态读取失败。';
        } finally {
          initializePromise = null;
        }
      })();

      await initializePromise;
    },
    async login(credentials: LoginCredentials) {
      this.status = 'loading';
      this.errorMessage = null;

      try {
        const session = await authClient.login(credentials);
        this.setSession(session);
        this.initialized = true;
        this.status = 'ready';
        return session;
      } catch (error) {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '登录失败，请稍后再试。';
        throw error;
      }
    },
    async register(credentials: RegisterCredentials) {
      this.status = 'loading';
      this.errorMessage = null;

      try {
        const session = await authClient.register(credentials);
        this.setSession(session);
        this.initialized = true;
        this.status = 'ready';
        return session;
      } catch (error) {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '注册失败，请稍后再试。';
        throw error;
      }
    },
    async logout() {
      this.status = 'loading';
      this.errorMessage = null;

      try {
        await authClient.logout();
      } finally {
        this.setSession(null);
        this.initialized = true;
        this.status = 'ready';
      }
    },
  },
});
