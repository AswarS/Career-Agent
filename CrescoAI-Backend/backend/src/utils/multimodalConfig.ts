import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { getSessionId } from '../bootstrap/state.js'

export type MultimodalConfig = {
  image_url?: string
  image_key?: string
  image_default_model?: string
  image_models?: string[]
  video_url?: string
  video_key?: string
  video_default_model?: string
  video_models?: string[]
}

// Per-session override set by NestJS layer from user DB settings.
// Keyed by sessionId (ALS-isolated), avoids reading global config files
// in server mode where each user has their own multimodal API keys.
const sessionOverrides = new Map<string, MultimodalConfig>()

export function setSessionMultimodalConfig(sessionId: string, cfg: MultimodalConfig): void {
  sessionOverrides.set(sessionId, cfg)
}

export function removeSessionMultimodalConfig(sessionId: string): void {
  sessionOverrides.delete(sessionId)
}

function parseModels(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getMultimodalConfig(): MultimodalConfig {
  // Server mode: use per-session config from user DB settings
  const sessionId = getSessionId()
  const override = sessionOverrides.get(sessionId)
  if (override && (override.image_url || override.video_url)) {
    return override
  }

  // CLI / fallback mode: read from $CLAUDE_CONFIG_DIR/multimodal_config.json
  const filePath = join(getClaudeConfigHomeDir(), 'multimodal_config.json')
  try {
    if (!existsSync(filePath)) return {}
    return JSON.parse(readFileSync(filePath, 'utf-8')) as MultimodalConfig
  } catch {
    return {}
  }
}
