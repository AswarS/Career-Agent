import { fileURLToPath } from 'node:url';

/** Safe diagnostic text: never include supplied values, JSON fragments or URL input. */
export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfigError'; }
}

function modelProfiles(raw: string | undefined, variable: string): Record<string, ModelProfile> {
  let value: unknown;
  try { value = JSON.parse(raw || '{}'); }
  catch { throw new ConfigError(`${variable}: invalid JSON; use a JSON object with double-quoted keys and strings`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigError(`${variable}: must be an object keyed by model profile`);
  let index = 0;
  for (const model of Object.values(value)) {
    const field = `${variable}[profile #${++index}]`;
    if (!model || typeof model !== 'object' || Array.isArray(model)) throw new ConfigError(`${field}: must be an object`);
    if (!['openai', 'anthropic'].includes(model.provider)) throw new ConfigError(`${field}.provider: must be openai or anthropic`);
    for (const key of ['model', 'apiKey', 'baseUrl']) {
      if (typeof model[key] !== 'string' || !model[key].trim()) throw new ConfigError(`${field}.${key}: must be a non-empty string`);
    }
    httpUrl(model.baseUrl, `${field}.baseUrl`);
  }
  return value as Record<string, ModelProfile>;
}

function httpUrl(value: string, field: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ConfigError(`${field}: must be a valid absolute HTTP(S) URL`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ConfigError(`${field}: requires HTTP(S) without embedded credentials, query or fragment`);
  return url;
}

export interface ModelProfile { provider: 'openai' | 'anthropic'; baseUrl: string; apiKey: string; model: string }
export interface GatewayConfig {
  host: string;
  port: number;
  apiToken: string | undefined;
  maxBodyBytes: number;
  maxRuns: number;
  harnessUrl?: string;
  harnessToken?: string;
  publicUrl?: string;
  models?: Record<string, ModelProfile>;
  userModels?: Record<string, ModelProfile>;
  traceDir?: string;
  maxResponseBytes?: number;
  maxModelBodyBytes?: number;
}

function positiveInt(value: string | undefined, fallback: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new ConfigError(`${name} must be a positive integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new ConfigError(`${name} must be between 1 and ${max}`);
  return number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const host = env.GATEWAY_HOST?.trim() || '127.0.0.1';
  const apiToken = env.GATEWAY_API_TOKEN?.trim() || undefined;
  const harnessUrl = env.GATEWAY_HARNESS_URL?.trim();
  const harnessToken = env.GATEWAY_HARNESS_TOKEN?.trim();
  const publicUrl = env.GATEWAY_PUBLIC_URL?.replace(/\/$/, '');
  const models = modelProfiles(env.GATEWAY_MODELS_JSON, 'GATEWAY_MODELS_JSON');
  const userModels = modelProfiles(env.GATEWAY_USER_MODELS_JSON, 'GATEWAY_USER_MODELS_JSON');
  if (Object.keys(models).length && !publicUrl) throw new ConfigError('GATEWAY_PUBLIC_URL is required for model proxy');
  if (publicUrl) {
    const url = httpUrl(publicUrl, 'GATEWAY_PUBLIC_URL');
    if (url.pathname !== '/') throw new ConfigError('GATEWAY_PUBLIC_URL must be an HTTP origin without a path');
  }
  if (Boolean(harnessUrl) !== Boolean(harnessToken)) throw new ConfigError('GATEWAY_HARNESS_URL and GATEWAY_HARNESS_TOKEN must be configured together');
  if (harnessUrl) {
    httpUrl(harnessUrl, 'GATEWAY_HARNESS_URL');
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !apiToken) {
    throw new ConfigError('GATEWAY_API_TOKEN is required when binding outside loopback');
  }
  return {
    host,
    port: positiveInt(env.GATEWAY_PORT, 8787, 65535, 'GATEWAY_PORT'),
    apiToken,
    harnessUrl,
    harnessToken,
    publicUrl, models, userModels,
    traceDir: env.GATEWAY_TRACE_DIR || fileURLToPath(new URL('../data/trajectories', import.meta.url)),
    maxResponseBytes: positiveInt(env.GATEWAY_MAX_RESPONSE_BYTES, 33_554_432, 134_217_728, 'GATEWAY_MAX_RESPONSE_BYTES'),
    maxModelBodyBytes: positiveInt(env.GATEWAY_MAX_MODEL_BODY_BYTES, 16_777_216, 67_108_864, 'GATEWAY_MAX_MODEL_BODY_BYTES'),
    maxBodyBytes: positiveInt(env.GATEWAY_MAX_BODY_BYTES, 1_048_576, 16_777_216, 'GATEWAY_MAX_BODY_BYTES'),
    maxRuns: positiveInt(env.GATEWAY_MAX_RUNS, 100, 10_000, 'GATEWAY_MAX_RUNS'),
  };
}
