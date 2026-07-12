import axios, { AxiosHeaders, type AxiosInstance } from 'axios';
import { runtimeConfig, type RuntimeConfig } from '../config/runtime';
import type { AuthSession, LoginCredentials, RegisterCredentials } from '../types/entities';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import { readStoredAuthSession, writeStoredAuthSession } from './authSessionStorage';

interface UpstreamAuthUser {
  id?: string | number;
  user_id?: string | number;
  userId?: string | number;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  name?: string | null;
}

interface UpstreamAuthSession {
  user?: UpstreamAuthUser | null;
  access_token?: string | null;
  accessToken?: string | null;
  token?: string | null;
  refresh_token?: string | null;
  refreshToken?: string | null;
  token_type?: string | null;
  tokenType?: string | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  expires_in?: number | string | null;
  expiresIn?: number | string | null;
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  refreshSession(): Promise<AuthSession | null>;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  register(credentials: RegisterCredentials): Promise<AuthSession>;
  logout(): Promise<void>;
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeExpiresIn(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeAuthSession(input: UpstreamAuthSession, fallbackIdentifier = ''): AuthSession {
  const user = input.user ?? {};
  const email = normalizeOptionalString(user.email);
  const username = normalizeOptionalString(user.username);
  const fallbackName = fallbackIdentifier.includes('@') ? fallbackIdentifier.split('@')[0] : fallbackIdentifier;
  const id = String(user.userId ?? user.user_id ?? user.id ?? fallbackIdentifier).trim();
  if (!id) {
    throw new Error('Authentication response is missing the user identity.');
  }
  const displayName = String(user.displayName ?? user.display_name ?? user.name ?? username ?? fallbackName ?? '用户').trim();

  return {
    user: {
      id,
      email,
      username,
      displayName: displayName || '用户',
    },
    accessToken: input.accessToken ?? input.access_token ?? input.token ?? null,
    refreshToken: input.refreshToken ?? input.refresh_token ?? null,
    tokenType: input.tokenType ?? input.token_type ?? 'Bearer',
    expiresAt: input.expiresAt ?? input.expires_at ?? null,
    expiresIn: normalizeExpiresIn(input.expiresIn ?? input.expires_in),
  };
}

function mergeAuthSessionWithStored(session: AuthSession, storedSession: AuthSession | null): AuthSession {
  return {
    ...session,
    accessToken: session.accessToken ?? storedSession?.accessToken ?? null,
    refreshToken: session.refreshToken ?? storedSession?.refreshToken ?? null,
    tokenType: session.tokenType ?? storedSession?.tokenType ?? 'Bearer',
    expiresAt: session.expiresAt ?? storedSession?.expiresAt ?? null,
    expiresIn: session.expiresIn ?? storedSession?.expiresIn ?? null,
  };
}

function createAxiosClient(baseUrl: string, withCredentials: boolean) {
  const httpClient = axios.create({
    baseURL: baseUrl,
    withCredentials,
    headers: {
      Accept: 'application/json',
    },
  });

  httpClient.interceptors.request.use((config) => {
    const session = readStoredAuthSession();
    const token = session?.accessToken;

    if (token) {
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `${session.tokenType || 'Bearer'} ${token}`);
    }

    return config;
  });

  return httpClient;
}

function createMockSession(email: string, displayName?: string): AuthSession {
  const normalizedEmail = email.trim().toLowerCase() || 'user@example.com';
  const localName = normalizedEmail.split('@')[0] || 'user';
  const normalizedDisplayName = displayName?.trim() || localName;

  return {
    user: {
      id: `mock-user-${normalizedEmail}`,
      email: normalizedEmail,
      username: localName,
      displayName: normalizedDisplayName,
    },
    accessToken: `mock-token-${normalizedEmail}`,
    refreshToken: `mock-refresh-token-${normalizedEmail}`,
    tokenType: 'Bearer',
    expiresAt: null,
    expiresIn: null,
  };
}

function createMockAuthClient(): AuthClient {
  return {
    async getSession() {
      return readStoredAuthSession();
    },
    async refreshSession() {
      return readStoredAuthSession();
    },
    async login(credentials) {
      return createMockSession(credentials.identifier);
    },
    async register(credentials) {
      return createMockSession(credentials.email || credentials.username || '', credentials.displayName);
    },
    async logout() {
      return undefined;
    },
  };
}

function createSkipAuthClient(config: RuntimeConfig): AuthClient {
  const createSession = (): AuthSession => ({
    user: {
      id: config.userId,
      email: null,
      username: 'local-dev',
      displayName: '本地用户',
    },
    accessToken: null,
    refreshToken: null,
    tokenType: 'Bearer',
    expiresAt: null,
    expiresIn: null,
  });

  return {
    async getSession() {
      return createSession();
    },
    async refreshSession() {
      return createSession();
    },
    async login() {
      return createSession();
    },
    async register() {
      return createSession();
    },
    async logout() {
      writeStoredAuthSession(null);
    },
  };
}

function formatAuthError(error: unknown, fallbackMessage: string) {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    const message = typeof responseData === 'object' && responseData && 'message' in responseData
      ? Array.isArray(responseData.message)
        ? responseData.message.join(', ')
        : String(responseData.message)
      : error.message;

    return new Error(message || fallbackMessage);
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

function createUpstreamAuthClient(config: RuntimeConfig, httpClient?: AxiosInstance): AuthClient {
  if (!config.apiBaseUrl) {
    const unavailable = async () => {
      throw new Error('认证接口需要配置 VITE_CAREER_AGENT_API_BASE_URL。');
    };

    return {
      getSession: async () => null,
      refreshSession: async () => null,
      login: unavailable,
      register: unavailable,
      logout: unavailable,
    };
  }

  const client = httpClient ?? createAxiosClient(config.apiBaseUrl, config.upstreamWithCredentials);

  async function postSession(path: string, data?: unknown, fallbackEmail?: string) {
    try {
      const response = await client.post<UpstreamAuthSession>(path, data);
      return normalizeAuthSession(response.data, fallbackEmail);
    } catch (error) {
      throw formatAuthError(error, '认证请求失败。');
    }
  }

  return {
    async getSession() {
      try {
        const storedSession = readStoredAuthSession();
        const response = await client.get<UpstreamAuthSession>(CAREER_AGENT_API_ROUTES.authSession());
        const normalizedSession = normalizeAuthSession(response.data, storedSession?.user.id);
        return mergeAuthSessionWithStored(normalizedSession, storedSession);
      } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 404)) {
          return null;
        }

        throw formatAuthError(error, '会话校验失败。');
      }
    },
    async refreshSession() {
      const storedSession = readStoredAuthSession();
      const refreshToken = storedSession?.refreshToken;

      if (!refreshToken) {
        return null;
      }

      try {
        const response = await client.post<UpstreamAuthSession>(CAREER_AGENT_API_ROUTES.authRefresh(), {
          refresh_token: refreshToken,
        });
        return mergeAuthSessionWithStored(
          normalizeAuthSession(response.data, storedSession.user.id),
          storedSession,
        );
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          return null;
        }

        throw formatAuthError(error, '刷新登录状态失败。');
      }
    },
    async login(credentials) {
      const identifier = credentials.identifier.trim();
      return postSession(CAREER_AGENT_API_ROUTES.authLogin(), {
        identifier,
        ...(identifier.includes('@') ? { email: identifier } : { username: identifier }),
        password: credentials.password,
      }, identifier);
    },
    async register(credentials) {
      return postSession(CAREER_AGENT_API_ROUTES.authRegister(), {
        display_name: credentials.displayName,
        email: credentials.email || undefined,
        username: credentials.username || undefined,
        password: credentials.password,
      }, credentials.email || credentials.username);
    },
    async logout() {
      try {
        await client.post(CAREER_AGENT_API_ROUTES.authLogout());
      } catch (error) {
        if (!axios.isAxiosError(error) || (error.response?.status !== 401 && error.response?.status !== 404)) {
          throw formatAuthError(error, '退出登录失败。');
        }
      } finally {
        writeStoredAuthSession(null);
      }
    },
  };
}

export function createAuthClient(config: RuntimeConfig = runtimeConfig): AuthClient {
  if (config.clientMode === 'upstream') {
    return config.skipAuth
      ? createSkipAuthClient(config)
      : createUpstreamAuthClient(config);
  }

  return createMockAuthClient();
}
