import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'

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

export function getMultimodalConfig(): MultimodalConfig {
  const filePath = join(getClaudeConfigHomeDir(), 'multimodal_config.json')
  try {
    if (!existsSync(filePath)) return {}
    return JSON.parse(readFileSync(filePath, 'utf-8')) as MultimodalConfig
  } catch {
    return {}
  }
}
