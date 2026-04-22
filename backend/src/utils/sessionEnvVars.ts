/**
 * Session-scoped environment variables set via /env.
 * Applied only to spawned child processes (via bash provider env overrides),
 * not to the REPL process itself.
 *
 * Now per-session via getState() for multi-user isolation.
 */
import { getState } from '../bootstrap/state.js'

export function getSessionEnvVars(): ReadonlyMap<string, string> {
  return getState().sessionEnvVarsMap
}

export function setSessionEnvVar(name: string, value: string): void {
  getState().sessionEnvVarsMap.set(name, value)
}

export function deleteSessionEnvVar(name: string): void {
  getState().sessionEnvVarsMap.delete(name)
}

export function clearSessionEnvVars(): void {
  getState().sessionEnvVarsMap.clear()
}
