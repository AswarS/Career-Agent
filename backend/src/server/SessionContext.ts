/**
 * SessionContext.ts — AsyncLocalStorage-based context isolation for multi-user server mode
 *
 * Each HTTP/WebSocket request runs inside its own ALS context, so that
 * module-level helpers (getState, getCwd, etc.) transparently route to
 * the correct per-session STATE without any parameter threading.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { PermissionConfig } from './permissions.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionConfig = {
  apiKey?: string
  baseUrl?: string
  provider?: string
  model?: string
  cwd: string
  permissions?: PermissionConfig
}

export type SessionContext = {
  sessionId: string
  state: any // State type from bootstrap/state — avoid circular import
  config: SessionConfig
  anthropicClient: any | null
  queryEngine: any | null
  mcpClients: Array<{ close: () => Promise<void> }>
  wsConnections: Set<any>
  abortController: AbortController
  createdAt: number
  lastActivityAt: number
  isHeadless: true
  sessionSwitched: { subscribe: (fn: (...args: any[]) => void) => void; emit: (...args: any[]) => void }
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage
// ---------------------------------------------------------------------------

const sessionAls = new AsyncLocalStorage<SessionContext>()

/**
 * Run a callback within a session's ALS context.
 */
export function runWithSessionContext<T>(ctx: SessionContext, fn: () => T): T {
  return sessionAls.run(ctx, fn)
}

/**
 * Get the current session context from ALS.
 */
export function getSessionContext(): SessionContext | undefined {
  return sessionAls.getStore()
}

/**
 * Check if we're currently running inside a server session context.
 */
export function isServerMode(): boolean {
  return sessionAls.getStore() !== undefined
}
