import type { SettingSource } from './constants.js'
import type { SettingsJson } from './types.js'
import type { SettingsWithErrors, ValidationError } from './validation.js'

/**
 * All settings caches are now per-session via getState() for multi-user isolation.
 * Each session gets its own cache in STATE.settingsSessionCache/settingsPerSourceCache/settingsParseFileCache.
 */
import { getState } from '../../bootstrap/state.js'

export function getSessionSettingsCache(): SettingsWithErrors | null {
  return getState().settingsSessionCache as SettingsWithErrors | null
}

export function setSessionSettingsCache(value: SettingsWithErrors): void {
  getState().settingsSessionCache = value
}

/**
 * Per-source cache for getSettingsForSource. Invalidated alongside the
 * merged sessionSettingsCache — same resetSettingsCache() triggers
 * (settings write, --add-dir, plugin init, hooks refresh).
 */
export function getCachedSettingsForSource(
  source: SettingSource,
): SettingsJson | null | undefined {
  const cache = getState().settingsPerSourceCache
  // undefined = cache miss; null = cached "no settings for this source"
  return cache.has(source) ? (cache.get(source) as SettingsJson | null) : undefined
}

export function setCachedSettingsForSource(
  source: SettingSource,
  value: SettingsJson | null,
): void {
  getState().settingsPerSourceCache.set(source, value)
}

/**
 * Path-keyed cache for parseSettingsFile. Both getSettingsForSource and
 * loadSettingsFromDisk call parseSettingsFile on the same paths during
 * startup — this dedupes the disk read + zod parse.
 */
type ParsedSettings = {
  settings: SettingsJson | null
  errors: ValidationError[]
}

export function getCachedParsedFile(path: string): ParsedSettings | undefined {
  return getState().settingsParseFileCache.get(path) as ParsedSettings | undefined
}

export function setCachedParsedFile(path: string, value: ParsedSettings): void {
  getState().settingsParseFileCache.set(path, value)
}

export function resetSettingsCache(): void {
  const s = getState()
  s.settingsSessionCache = null
  s.settingsPerSourceCache.clear()
  s.settingsParseFileCache.clear()
}

/**
 * Plugin settings base layer for the settings cascade.
 * pluginLoader writes here after loading plugins;
 * loadSettingsFromDisk reads it as the lowest-priority base.
 */
export function getPluginSettingsBase(): Record<string, unknown> | undefined {
  return getState().settingsPluginBase
}

export function setPluginSettingsBase(
  settings: Record<string, unknown> | undefined,
): void {
  getState().settingsPluginBase = settings
}

export function clearPluginSettingsBase(): void {
  getState().settingsPluginBase = undefined
}
