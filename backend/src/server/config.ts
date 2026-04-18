/**
 * config.ts — Server configuration parser
 *
 * Reads CLI flags and environment variables to produce a validated ServerConfig.
 */

import type { ServerConfig } from './types.js'

export const DEFAULT_SERVER_CONFIG: Readonly<Required<Omit<ServerConfig, 'unix'>>> = {
  port: 8080,
  host: '0.0.0.0',
  authToken: '',
  idleTimeoutMs: 1_800_000, // 30 minutes
  maxSessions: 100,
  workspace: '',
  corsOrigins: ['*'],
  rateLimitPerMinute: 0, // unlimited by default
  maxRequestBodyBytes: 1_000_000, // 1MB
  requestTimeoutMs: 300_000, // 5 minutes
}

/**
 * Parse an environment variable as an integer, returning fallback on failure.
 */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

/**
 * Parse and validate server config from CLI options + environment variables.
 * CLI flags take precedence over env vars, which take precedence over defaults.
 */
export function parseServerConfig(raw: Partial<ServerConfig> = {}): ServerConfig {
  const config: ServerConfig = {
    port: raw.port ?? envInt('CLAUDE_SERVER_PORT', DEFAULT_SERVER_CONFIG.port),
    host: raw.host ?? process.env.CLAUDE_SERVER_HOST ?? DEFAULT_SERVER_CONFIG.host,
    authToken: raw.authToken ?? process.env.CLAUDE_SERVER_AUTH_TOKEN ?? DEFAULT_SERVER_CONFIG.authToken,
    idleTimeoutMs: raw.idleTimeoutMs ?? envInt('CLAUDE_SERVER_TIMEOUT_MS', DEFAULT_SERVER_CONFIG.idleTimeoutMs),
    maxSessions: raw.maxSessions ?? envInt('CLAUDE_SERVER_MAX_SESSIONS', DEFAULT_SERVER_CONFIG.maxSessions),
    workspace: raw.workspace ?? process.env.CLAUDE_SERVER_WORKSPACE ?? process.cwd(),
    corsOrigins: raw.corsOrigins ?? parseCorsEnv(process.env.CLAUDE_SERVER_CORS_ORIGINS) ?? DEFAULT_SERVER_CONFIG.corsOrigins,
    rateLimitPerMinute: raw.rateLimitPerMinute ?? envInt('CLAUDE_SERVER_RATE_LIMIT', DEFAULT_SERVER_CONFIG.rateLimitPerMinute),
    maxRequestBodyBytes: raw.maxRequestBodyBytes ?? envInt('CLAUDE_SERVER_MAX_BODY_BYTES', DEFAULT_SERVER_CONFIG.maxRequestBodyBytes),
    requestTimeoutMs: raw.requestTimeoutMs ?? envInt('CLAUDE_SERVER_REQUEST_TIMEOUT_MS', DEFAULT_SERVER_CONFIG.requestTimeoutMs),
  }

  // Basic validation
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}. Must be between 1 and 65535.`)
  }
  if (config.maxSessions < 1) {
    throw new Error(`Invalid maxSessions: ${config.maxSessions}. Must be >= 1.`)
  }

  return config
}

/**
 * Parse CORS origins from comma-separated env var string.
 * E.g., "https://app.example.com,https://admin.example.com"
 */
function parseCorsEnv(raw?: string): string[] | undefined {
  if (!raw) return undefined
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}
