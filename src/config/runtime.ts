export type CareerAgentClientMode = 'mock' | 'upstream';
export type ArtifactTransport = 'mock' | 'polling' | 'sse' | 'websocket';

export interface RuntimeEnvLike {
  MODE?: string;
  VITE_CAREER_AGENT_CLIENT_MODE?: string;
  VITE_CAREER_AGENT_API_BASE_URL?: string;
  VITE_CAREER_AGENT_ARTIFACT_TRANSPORT?: string;
  VITE_CAREER_AGENT_ENABLE_VOICE_INPUT?: string;
}

export interface RuntimeConfig {
  environmentName: string;
  clientMode: CareerAgentClientMode;
  apiBaseUrl: string | null;
  artifactTransport: ArtifactTransport;
  voiceInputEnabled: boolean;
  upstreamConfigured: boolean;
}

function normalizeClientMode(value: string | undefined): CareerAgentClientMode {
  return value === 'upstream' ? 'upstream' : 'mock';
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const nextValue = value?.trim();

  if (!nextValue) {
    return null;
  }

  return nextValue.replace(/\/+$/, '');
}

function normalizeBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes' || normalizedValue === 'on';
}

function normalizeArtifactTransport(
  clientMode: CareerAgentClientMode,
  value: string | undefined,
): ArtifactTransport {
  if (clientMode === 'mock') {
    return 'mock';
  }

  if (value === 'sse' || value === 'websocket' || value === 'polling') {
    return value;
  }

  return 'polling';
}

export function resolveRuntimeConfig(env: RuntimeEnvLike): RuntimeConfig {
  const clientMode = normalizeClientMode(env.VITE_CAREER_AGENT_CLIENT_MODE);
  const apiBaseUrl = normalizeBaseUrl(env.VITE_CAREER_AGENT_API_BASE_URL);

  return {
    environmentName: env.MODE?.trim() || 'development',
    clientMode,
    apiBaseUrl,
    artifactTransport: normalizeArtifactTransport(clientMode, env.VITE_CAREER_AGENT_ARTIFACT_TRANSPORT),
    voiceInputEnabled: normalizeBoolean(env.VITE_CAREER_AGENT_ENABLE_VOICE_INPUT),
    upstreamConfigured: clientMode === 'upstream' && Boolean(apiBaseUrl),
  };
}

export const runtimeConfig = resolveRuntimeConfig(import.meta.env);
