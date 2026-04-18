/**
 * instanceCommands.ts — Terminal /instance command logic
 *
 * Manages multi-user instances within a single Claude Code process.
 * Used by the CLI /instance command for local debugging without a frontend.
 *
 * Each instance has its own STATE, API Key, Base URL, working directory,
 * QueryEngine, and MCP connections — fully isolated from other instances.
 */

import { SessionManager, type CreateSessionOptions } from './SessionManager.js'
import { runWithSessionContext, getSessionContext, type SessionContext } from './SessionContext.js'
import type { ServerConfig } from './types.js'

// ---------------------------------------------------------------------------
// Singleton manager for terminal mode
// ---------------------------------------------------------------------------

let instanceManager: InstanceCommandManager | null = null

export function getInstanceManager(): InstanceCommandManager {
  if (!instanceManager) {
    instanceManager = new InstanceCommandManager()
  }
  return instanceManager
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstanceInfo = {
  sessionId: string
  userId: string
  cwd: string
  createdAt: number
  lastActivityAt: number
  hasQueryEngine: boolean
}

export type InstanceCommandResult =
  | { ok: true; message: string; sessionId?: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// InstanceCommandManager
// ---------------------------------------------------------------------------

export class InstanceCommandManager {
  private sessionManager: SessionManager
  private currentInstanceId: string | null = null
  /** userId lookup (stored because SessionManager doesn't track it) */
  private userIdMap: Map<string, string> = new Map()

  constructor() {
    const config: ServerConfig = {
      port: 0, // Not used in terminal mode
      host: 'localhost',
      authToken: '',
      maxSessions: 50,
      idleTimeoutMs: 0, // Never expire in terminal mode
    }
    this.sessionManager = new SessionManager(config)
  }

  /** Create a new isolated instance */
  async createInstance(opts: CreateInstanceOptions): Promise<InstanceCommandResult> {
    try {
      const sessionOpts: CreateSessionOptions = {
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        cwd: opts.cwd,
      }

      const { sessionId, context } = await this.sessionManager.createSession(sessionOpts)

      this.userIdMap.set(sessionId, opts.userId)

      // Auto-switch to new instance
      this.currentInstanceId = sessionId
      runWithSessionContext(context, () => {
        // Bind ALS context for subsequent operations
      })

      return {
        ok: true,
        message: `Instance created: ${sessionId.slice(0, 8)} | user: ${opts.userId} | cwd: ${opts.cwd || 'default'}`,
        sessionId,
      }
    } catch (err: any) {
      return { ok: false, error: `Failed to create instance: ${err.message}` }
    }
  }

  /** Switch to an existing instance */
  switchInstance(sessionId: string): InstanceCommandResult {
    const managed = this.sessionManager.getSession(sessionId)
    if (!managed) {
      return { ok: false, error: `Instance not found: ${sessionId}` }
    }

    this.currentInstanceId = sessionId
    this.sessionManager.touchSession(sessionId)

    const userId = this.userIdMap.get(sessionId) ?? 'unknown'
    return {
      ok: true,
      message: `Switched to instance: ${sessionId.slice(0, 8)} | user: ${userId}`,
      sessionId,
    }
  }

  /** Close and destroy an instance */
  async closeInstance(sessionId: string): Promise<InstanceCommandResult> {
    const managed = this.sessionManager.getSession(sessionId)
    if (!managed) {
      return { ok: false, error: `Instance not found: ${sessionId}` }
    }

    const userId = this.userIdMap.get(sessionId) ?? 'unknown'

    const destroyed = await this.sessionManager.destroySession(sessionId)
    this.userIdMap.delete(sessionId)

    if (this.currentInstanceId === sessionId) {
      this.currentInstanceId = null
    }

    if (destroyed) {
      return {
        ok: true,
        message: `Instance closed: ${sessionId.slice(0, 8)} | user: ${userId} | transcript saved`,
      }
    }
    return { ok: false, error: `Failed to destroy instance: ${sessionId}` }
  }

  /** List all active instances */
  listInstances(): InstanceInfo[] {
    const sessions = this.sessionManager.getAllSessions()
    const result: InstanceInfo[] = []

    for (const [id, managed] of sessions) {
      result.push({
        sessionId: id,
        userId: this.userIdMap.get(id) ?? 'unknown',
        cwd: managed.context.config.cwd,
        createdAt: managed.context.createdAt,
        lastActivityAt: managed.context.lastActivityAt,
        hasQueryEngine: managed.context.queryEngine !== null,
      })
    }

    return result
  }

  /** Get info about the current instance */
  getCurrentInfo(): InstanceCommandResult & { info?: InstanceInfo } {
    if (!this.currentInstanceId) {
      return { ok: true, message: 'No active instance (using default CLI mode)' }
    }

    const managed = this.sessionManager.getSession(this.currentInstanceId)
    if (!managed) {
      this.currentInstanceId = null
      return { ok: true, message: 'Current instance no longer exists' }
    }

    const info: InstanceInfo = {
      sessionId: this.currentInstanceId,
      userId: this.userIdMap.get(this.currentInstanceId) ?? 'unknown',
      cwd: managed.context.config.cwd,
      createdAt: managed.context.createdAt,
      lastActivityAt: managed.context.lastActivityAt,
      hasQueryEngine: managed.context.queryEngine !== null,
    }

    return {
      ok: true,
      message: `Current instance: ${info.sessionId.slice(0, 8)} | user: ${info.userId} | cwd: ${info.cwd}`,
      sessionId: this.currentInstanceId,
      info,
    }
  }

  /** Get the current instance's SessionContext (for ALS binding) */
  getCurrentContext(): SessionContext | null {
    if (!this.currentInstanceId) return null
    const managed = this.sessionManager.getSession(this.currentInstanceId)
    return managed?.context ?? null
  }

  /** Get the current instance ID */
  getCurrentInstanceId(): string | null {
    return this.currentInstanceId
  }

  /** Get the SessionManager (for advanced usage) */
  getSessionManager(): SessionManager {
    return this.sessionManager
  }

  /** Check if any instances are active */
  hasInstances(): boolean {
    return this.sessionManager.getAllSessions().size > 0
  }

  /** Destroy all instances (for cleanup) */
  async destroyAll(): Promise<number> {
    this.currentInstanceId = null
    this.userIdMap.clear()
    return this.sessionManager.destroyAllSessions()
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateInstanceOptions = {
  userId: string
  apiKey?: string
  baseUrl?: string
  cwd?: string
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatInstanceList(instances: InstanceInfo[], currentId: string | null): string {
  if (instances.length === 0) {
    return 'No active instances. Use /instance new to create one.'
  }

  const lines: string[] = ['Active instances:', '']

  for (const inst of instances) {
    const marker = inst.sessionId === currentId ? ' *' : '  '
    const shortId = inst.sessionId.slice(0, 8)
    const qe = inst.hasQueryEngine ? 'QE' : '--'
    const age = formatAge(inst.createdAt)
    lines.push(`${marker} ${shortId}  ${inst.userId.padEnd(12)}  ${inst.cwd.padEnd(30)}  ${qe}  ${age}`)
  }

  lines.push('')
  lines.push('  * = current instance')
  return lines.join('\n')
}

function formatAge(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

// ---------------------------------------------------------------------------
// Parse /instance subcommand
// ---------------------------------------------------------------------------

export type ParsedInstanceCommand = {
  subcommand: string
  args: string
}

export function parseInstanceCommand(input: string): ParsedInstanceCommand {
  const trimmed = input.trim()
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) {
    return { subcommand: trimmed, args: '' }
  }
  return {
    subcommand: trimmed.slice(0, spaceIndex),
    args: trimmed.slice(spaceIndex + 1).trim(),
  }
}
