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
