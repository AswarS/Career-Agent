import axios, { AxiosHeaders } from 'axios';
import { runtimeConfig } from '../config/runtime';
import { readStoredAuthSession } from './authSessionStorage';
import { CAREER_AGENT_API_ROUTE_PATTERNS } from './careerAgentApiRoutes';

export type GatewayMonitorRange = '1h' | '24h' | '7d' | '30d' | 'all';
export interface TokenComponent { key: string; label: string; tokens: number; percentage: number; }
export interface RequestComponent { key: string; label: string; estimatedTokens: number; calibratedTokens: number; percentage: number; }
export interface MonitorRequest {
  requestId: string;
  sessionId: string | null;
  timestamp: string | null;
  model: string | null;
  outcome: string;
  status: number | null;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  estimatedPromptTokens: number;
  estimateRatio: number | null;
  dominantCause: string;
  messageCount: number;
  toolDefinitionCount: number;
  components: RequestComponent[];
  largestToolDefinitions: Array<{ name: string; estimatedTokens: number }>;
}
export interface MonitorSession {
  sessionId: string;
  firstAt: string | null;
  lastAt: string | null;
  requests: number;
  completed: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  attemptedPromptTokens: number;
  failedAttemptedPromptTokens: number;
  averageTokensPerCompletedRequest: number;
  averageDurationMs: number;
  componentShares: TokenComponent[];
  attemptedComponentShares: TokenComponent[];
}
export interface GatewayMonitorSummary {
  enabled: boolean;
  generatedAt: string;
  range: GatewayMonitorRange;
  totals: {
    requests: number;
    completed: number;
    failed: number;
    pending: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    attemptedPromptTokens: number;
    failedAttemptedPromptTokens: number;
    durationMs: number;
    averageDurationMs: number;
    cacheHitRate: number;
  };
  componentShares: TokenComponent[];
  attemptedComponentShares: TokenComponent[];
  trend: Array<{ bucket: string; requests: number; promptTokens: number; completionTokens: number; totalTokens: number }>;
  toolSchemas: Array<{ name: string; tokens: number; requests: number; averageTokens: number }>;
  sessions: MonitorSession[];
  requests: MonitorRequest[];
}

export async function getGatewayMonitorSummary(input: {
  range: GatewayMonitorRange;
  sessionId?: string;
  limit?: number;
}): Promise<GatewayMonitorSummary> {
  if (runtimeConfig.clientMode !== 'upstream' || !runtimeConfig.apiBaseUrl) {
    throw new Error('Token 监控需要在 upstream 模式下使用。');
  }
  const client = axios.create({
    baseURL: runtimeConfig.apiBaseUrl,
    withCredentials: runtimeConfig.upstreamWithCredentials,
    headers: { Accept: 'application/json' },
  });
  client.interceptors.request.use((config) => {
    const session = readStoredAuthSession();
    if (session?.accessToken) {
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `${session.tokenType || 'Bearer'} ${session.accessToken}`);
    }
    return config;
  });
  const response = await client.get<GatewayMonitorSummary>(
    CAREER_AGENT_API_ROUTE_PATTERNS.gatewayMonitorSummary,
    { params: { range: input.range, sessionId: input.sessionId?.trim() || undefined, limit: input.limit ?? 100 } },
  );
  return response.data;
}
