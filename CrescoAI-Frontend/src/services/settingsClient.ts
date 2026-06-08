import axios, { AxiosHeaders, type AxiosInstance } from 'axios';
import { runtimeConfig, type RuntimeConfig } from '../config/runtime';
import type {
  AccountSetting,
  ApiSetting,
  ConnectionTestResult,
  UpdateUsernameInput,
  UpsertApiSettingInput,
  UserSettings,
} from '../types/entities';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import { readStoredAuthSession } from './authSessionStorage';

interface UpstreamAccountSetting {
  id?: string | number;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

interface UpstreamApiSetting {
  id?: string | number;
  user_id?: string | number;
  userId?: string | number;
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  baseUrl?: string | null;
  has_api_key?: boolean | null;
  hasApiKey?: boolean | null;
  api_key_hint?: string | null;
  apiKeyHint?: string | null;
  api_key_fingerprint?: string | null;
  apiKeyFingerprint?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  has_image_key?: boolean | null;
  hasImageKey?: boolean | null;
  image_key_hint?: string | null;
  imageKeyHint?: string | null;
  image_default_model?: string | null;
  imageDefaultModel?: string | null;
  image_models?: string[] | null;
  imageModels?: string[] | null;
  video_url?: string | null;
  videoUrl?: string | null;
  has_video_key?: boolean | null;
  hasVideoKey?: boolean | null;
  video_key_hint?: string | null;
  videoKeyHint?: string | null;
  video_default_model?: string | null;
  videoDefaultModel?: string | null;
  video_models?: string[] | null;
  videoModels?: string[] | null;
}

interface UpstreamUserSettings {
  account?: UpstreamAccountSetting | null;
  api_settings?: UpstreamApiSetting[] | null;
  apiSettings?: UpstreamApiSetting[] | null;
}

interface UpstreamUsernameUpdateResult {
  message?: string;
  account?: UpstreamAccountSetting | null;
}

interface UpstreamApiSettingUpdateResult {
  message?: string;
  api_setting?: UpstreamApiSetting | null;
  apiSetting?: UpstreamApiSetting | null;
}

interface UpstreamConnectionTestResult {
  ok?: boolean;
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  baseUrl?: string | null;
  status?: number | string | null;
  message?: string | null;
}

export interface SettingsClient {
  getSettings(): Promise<UserSettings>;
  updateUsername(input: UpdateUsernameInput): Promise<AccountSetting>;
  listApiSettings(): Promise<ApiSetting[]>;
  upsertApiSetting(input: UpsertApiSettingInput): Promise<ApiSetting>;
  testApiSetting(input: UpsertApiSettingInput): Promise<ConnectionTestResult>;
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeDateString(value: unknown) {
  return normalizeOptionalString(value);
}

export function normalizeAccountSetting(input: UpstreamAccountSetting | null | undefined): AccountSetting {
  const storedUser = readStoredAuthSession()?.user;
  const email = normalizeOptionalString(input?.email ?? storedUser?.email);
  const username = normalizeOptionalString(input?.username ?? storedUser?.username);
  const displayName = normalizeOptionalString(input?.displayName ?? input?.display_name ?? storedUser?.displayName)
    ?? username
    ?? email
    ?? '用户';

  return {
    id: String(input?.id ?? storedUser?.id ?? '1'),
    email,
    username,
    displayName,
    createdAt: normalizeDateString(input?.createdAt ?? input?.created_at),
    updatedAt: normalizeDateString(input?.updatedAt ?? input?.updated_at),
  };
}

export function normalizeApiSetting(input: UpstreamApiSetting): ApiSetting {
  const imageModelsRaw = input.imageModels ?? input.image_models;
  const videoModelsRaw = input.videoModels ?? input.video_models;

  return {
    id: String(input.id ?? `${input.provider ?? 'anthropic'}-api-setting`),
    userId: String(input.userId ?? input.user_id ?? readStoredAuthSession()?.user.id ?? '1'),
    provider: normalizeOptionalString(input.provider) ?? 'anthropic',
    model: normalizeOptionalString(input.model) ?? 'claude-sonnet-4-5',
    baseUrl: normalizeOptionalString(input.baseUrl ?? input.base_url) ?? 'https://api.anthropic.com',
    hasApiKey: Boolean(input.hasApiKey ?? input.has_api_key),
    apiKeyHint: normalizeOptionalString(input.apiKeyHint ?? input.api_key_hint),
    apiKeyFingerprint: normalizeOptionalString(input.apiKeyFingerprint ?? input.api_key_fingerprint),
    createdAt: normalizeDateString(input.createdAt ?? input.created_at),
    updatedAt: normalizeDateString(input.updatedAt ?? input.updated_at),
    imageUrl: normalizeOptionalString(input.imageUrl ?? input.image_url),
    hasImageKey: Boolean(input.hasImageKey ?? input.has_image_key),
    imageKeyHint: normalizeOptionalString(input.imageKeyHint ?? input.image_key_hint),
    imageDefaultModel: normalizeOptionalString(input.imageDefaultModel ?? input.image_default_model),
    imageModels: Array.isArray(imageModelsRaw) ? imageModelsRaw : [],
    videoUrl: normalizeOptionalString(input.videoUrl ?? input.video_url),
    hasVideoKey: Boolean(input.hasVideoKey ?? input.has_video_key),
    videoKeyHint: normalizeOptionalString(input.videoKeyHint ?? input.video_key_hint),
    videoDefaultModel: normalizeOptionalString(input.videoDefaultModel ?? input.video_default_model),
    videoModels: Array.isArray(videoModelsRaw) ? videoModelsRaw : [],
  };
}

export function normalizeUserSettings(input: UpstreamUserSettings): UserSettings {
  const apiSettings = input.apiSettings ?? input.api_settings ?? [];

  return {
    account: normalizeAccountSetting(input.account),
    apiSettings: apiSettings.map(normalizeApiSetting),
  };
}

export function normalizeConnectionTestResult(input: UpstreamConnectionTestResult): ConnectionTestResult {
  const numericStatus = Number(input.status);
  const rawMessage = normalizeOptionalString(input.message);

  return {
    ok: Boolean(input.ok),
    provider: normalizeOptionalString(input.provider) ?? 'anthropic',
    model: normalizeOptionalString(input.model) ?? 'claude-sonnet-4-5',
    baseUrl: normalizeOptionalString(input.baseUrl ?? input.base_url) ?? 'https://api.anthropic.com',
    status: Number.isFinite(numericStatus) ? numericStatus : null,
    message: normalizeConnectionMessage(rawMessage) ?? (input.ok ? '连接成功' : '连接失败'),
  };
}

export function normalizeConnectionMessage(message: string | null) {
  if (!message) {
    return null;
  }

  try {
    const parsed = JSON.parse(message) as { error?: { message?: unknown }; message?: unknown };
    return normalizeOptionalString(parsed.error?.message ?? parsed.message) ?? message;
  } catch {
    return message;
  }
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

function formatSettingsError(error: unknown, fallbackMessage: string) {
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

function createMockSettingsClient(): SettingsClient {
  const session = readStoredAuthSession();
  let account = normalizeAccountSetting({
    id: session?.user.id ?? 'mock-user',
    email: session?.user.email ?? 'user@example.com',
    username: session?.user.username ?? 'user',
    displayName: session?.user.displayName ?? '用户',
  });
  let apiSetting: ApiSetting | null = {
    id: 'mock-api-setting',
    userId: account.id,
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    baseUrl: 'https://api.anthropic.com',
    hasApiKey: false,
    apiKeyHint: null,
    apiKeyFingerprint: null,
    createdAt: null,
    updatedAt: null,
  };

  return {
    async getSettings() {
      return {
        account,
        apiSettings: apiSetting ? [apiSetting] : [],
      };
    },
    async updateUsername(input) {
      account = {
        ...account,
        username: input.username,
        displayName: input.displayName?.trim() || account.displayName,
        updatedAt: new Date().toISOString(),
      };
      return account;
    },
    async listApiSettings() {
      return apiSetting ? [apiSetting] : [];
    },
    async upsertApiSetting(input) {
      apiSetting = {
        id: apiSetting?.id ?? 'mock-api-setting',
        userId: account.id,
        provider: input.provider || 'anthropic',
        model: input.model || apiSetting?.model || 'claude-sonnet-4-5',
        baseUrl: input.baseUrl || apiSetting?.baseUrl || 'https://api.anthropic.com',
        hasApiKey: Boolean(input.apiKey || apiSetting?.hasApiKey),
        apiKeyHint: input.apiKey ? `${input.apiKey.slice(0, 8)}...${input.apiKey.slice(-4)}` : apiSetting?.apiKeyHint ?? null,
        apiKeyFingerprint: apiSetting?.apiKeyFingerprint ?? null,
        createdAt: apiSetting?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return apiSetting;
    },
    async testApiSetting(input) {
      return {
        ok: Boolean(input.apiKey || apiSetting?.hasApiKey),
        provider: input.provider || apiSetting?.provider || 'anthropic',
        model: input.model || apiSetting?.model || 'claude-sonnet-4-5',
        baseUrl: input.baseUrl || apiSetting?.baseUrl || 'https://api.anthropic.com',
        status: input.apiKey || apiSetting?.hasApiKey ? 200 : 400,
        message: input.apiKey || apiSetting?.hasApiKey ? '连接成功' : '请先填写或保存 API Key。',
      };
    },
  };
}

function createUpstreamSettingsClient(config: RuntimeConfig, httpClient?: AxiosInstance): SettingsClient {
  if (!config.apiBaseUrl) {
    const unavailable = async () => {
      throw new Error('设置接口需要配置 VITE_CAREER_AGENT_API_BASE_URL。');
    };

    return {
      getSettings: unavailable,
      updateUsername: unavailable,
      listApiSettings: unavailable,
      upsertApiSetting: unavailable,
      testApiSetting: unavailable,
    };
  }

  const client = httpClient ?? createAxiosClient(config.apiBaseUrl, config.upstreamWithCredentials);

  return {
    async getSettings() {
      try {
        const response = await client.get<UpstreamUserSettings>(CAREER_AGENT_API_ROUTES.settings());
        return normalizeUserSettings(response.data);
      } catch (error) {
        throw formatSettingsError(error, '设置加载失败。');
      }
    },
    async updateUsername(input) {
      try {
        const response = await client.patch<UpstreamUsernameUpdateResult>(CAREER_AGENT_API_ROUTES.settingsUsername(), {
          username: input.username,
          display_name: input.displayName,
        });
        return normalizeAccountSetting(response.data.account);
      } catch (error) {
        throw formatSettingsError(error, '用户名更新失败。');
      }
    },
    async listApiSettings() {
      try {
        const response = await client.get<UpstreamApiSetting[]>(CAREER_AGENT_API_ROUTES.settingsApi());
        return response.data.map(normalizeApiSetting);
      } catch (error) {
        throw formatSettingsError(error, 'API 配置加载失败。');
      }
    },
    async upsertApiSetting(input) {
      try {
        const response = await client.put<UpstreamApiSettingUpdateResult>(CAREER_AGENT_API_ROUTES.settingsApi(), {
          provider: input.provider || 'anthropic',
          api_key: input.apiKey || undefined,
          model: input.model || undefined,
          base_url: input.baseUrl || undefined,
          image_url: input.imageUrl || undefined,
          image_key: input.imageKey || undefined,
          image_default_model: input.imageDefaultModel || undefined,
          image_models: input.imageModels || undefined,
          video_url: input.videoUrl || undefined,
          video_key: input.videoKey || undefined,
          video_default_model: input.videoDefaultModel || undefined,
          video_models: input.videoModels || undefined,
        });
        return normalizeApiSetting(response.data.apiSetting ?? response.data.api_setting ?? {});
      } catch (error) {
        throw formatSettingsError(error, 'API 配置保存失败。');
      }
    },
    async testApiSetting(input) {
      try {
        const response = await client.post<UpstreamConnectionTestResult>(CAREER_AGENT_API_ROUTES.settingsApiTest(), {
          provider: input.provider || 'anthropic',
          api_key: input.apiKey || undefined,
          model: input.model || undefined,
          base_url: input.baseUrl || undefined,
        });
        return normalizeConnectionTestResult(response.data);
      } catch (error) {
        throw formatSettingsError(error, 'API 连接测试失败。');
      }
    },
  };
}

export function createSettingsClient(config: RuntimeConfig = runtimeConfig): SettingsClient {
  if (config.clientMode === 'upstream') {
    return createUpstreamSettingsClient(config);
  }

  return createMockSettingsClient();
}
