/**
 * SessionManager.ts — Multi-user session lifecycle management
 *
 * Creates, tracks, and destroys isolated SessionContext instances.
 * Each session gets its own STATE copy, Anthropic client, working directory,
 * and MCP connections — completely independent from other sessions.
 */

import { randomUUID } from 'node:crypto'
import type { ServerConfig } from './types.js'
import type { SessionContext, SessionConfig } from './SessionContext.js'
import { createIsolatedState } from '../bootstrap/state.js'
import { createSignal } from '../utils/signal.js'
import { cleanupSessionResources, cleanupWithTimeout } from './cleanup.js'
import type { SessionId } from '../types/ids.js'
import { createQueryEngineForSession } from './queryEngineFactory.js'
import { McpSessionManager, type SessionMcpConfig } from './mcpSessionManager.js'
import { runWithSessionContext } from './SessionContext.js'

export type CreateSessionOptions = {
  apiKey?: string
  baseUrl?: string
  provider?: string
  model?: string
  cwd?: string
  userId?: string
  permissions?: SessionConfig['permissions']
  mcpServers?: Record<string, SessionMcpConfig>
}

export type ManagedSession = {
  context: SessionContext
  lastActivityAt: number
  mcpManager: McpSessionManager | null
}

export class SessionManager {
  private sessions: Map<string, ManagedSession> = new Map()
  private config: ServerConfig
  private sweeperTimer: ReturnType<typeof setInterval> | null = null

  constructor(config: ServerConfig) {
    this.config = config
  }

  /**
   * Create a new isolated session with its own STATE, workspace, and clients.
   */
  async createSession(opts: CreateSessionOptions = {}): Promise<{ sessionId: string; context: SessionContext }> {
    if (this.sessions.size >= (this.config.maxSessions ?? 100)) {
      throw new Error(`Maximum sessions reached (${this.config.maxSessions ?? 100})`)
    }

    const sessionId = randomUUID() as SessionId
    const workspace = opts.cwd ?? this.config.workspace ?? process.cwd()

    const state = createIsolatedState({
      sessionId,
      cwd: workspace,
      originalCwd: workspace,
      projectRoot: workspace,
      isInteractive: false, // Server mode is non-interactive
    })

    const sessionConfig: SessionConfig = {
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
      provider: opts.provider,
      model: opts.model,
      cwd: workspace,
      permissions: opts.permissions ?? { mode: 'allow_all' },
      userId: opts.userId,
    }

    const context: SessionContext = {
      sessionId,
      userId: opts.userId,
      state,
      config: sessionConfig,
      anthropicClient: null, // Will be initialized lazily when first API call is made
      queryEngine: null, // Will be set below after context is assembled
      mcpClients: [],
      wsConnections: new Set(),
      abortController: new AbortController(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      isHeadless: true as const,
      sessionSwitched: createSignal<[id: SessionId]>(),
    }

    // Create the QueryEngine — this gives the session full LLM + tool capabilities
    let mcpManager: McpSessionManager | null = null

    if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
      mcpManager = new McpSessionManager()
      try {
        await mcpManager.connectAll(opts.mcpServers)
        // Update context with MCP clients and tools
        context.mcpClients = mcpManager.getConnectedClients()
      } catch (err) {
        console.warn(`[SessionManager] MCP connection failed for session ${sessionId}:`, err)
      }
    }

    try {
      const mcpTools = mcpManager?.getMcpTools() ?? []
      // Run QueryEngine creation inside ALS context so that
      // getAnthropicApiKeyWithSource() and getAnthropicClient() can find the
      // per-session API key via getSessionContext().
      context.queryEngine = runWithSessionContext(context, () =>
        createQueryEngineForSession(context, { mcpTools }),
      )
    } catch (err) {
      console.warn(`[SessionManager] Failed to create QueryEngine for session ${sessionId}:`, err)
      // Session still works in echo mode if QueryEngine creation fails
    }

    this.sessions.set(sessionId, { context, lastActivityAt: Date.now(), mcpManager })

    return { sessionId, context }
  }

  /**
   * Get an existing session by ID.
   */
  getSession(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): ReadonlyMap<string, ManagedSession> {
    return this.sessions
  }

  /**
   * Get sessions belonging to a specific user.
   */
  getSessionsByUser(userId: string): Map<string, ManagedSession> {
    const result = new Map<string, ManagedSession>()
    for (const [id, session] of this.sessions) {
      if (session.context.userId === userId) {
        result.set(id, session)
      }
    }
    return result
  }

  /**
   * Update last activity timestamp for a session.
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivityAt = Date.now()
      session.context.lastActivityAt = Date.now()
    }
  }

  /**
   * Destroy a single session, cleaning up all resources.
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // Disconnect MCP servers first
    if (session.mcpManager) {
      await session.mcpManager.disconnectAll().catch((err) => {
        console.warn(`[SessionManager] MCP disconnect failed for ${sessionId}:`, err)
      })
    }

    await cleanupWithTimeout(() =>
      cleanupSessionResources({
        wsConnections: session.context.wsConnections,
        mcpClients: session.context.mcpClients,
        abortController: session.context.abortController,
      }),
    )

    this.sessions.delete(sessionId)
    return true
  }

  /**
   * Destroy all sessions. Used during graceful shutdown.
   */
  async destroyAllSessions(): Promise<number> {
    const ids = Array.from(this.sessions.keys())
    const results = await Promise.allSettled(
      ids.map(id => this.destroySession(id)),
    )
    return results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  /**
   * Start idle session sweeper. Checks every 60s for timed-out sessions.
   */
  startIdleSweeper(intervalMs: number = 60_000): void {
    if (this.sweeperTimer) return

    this.sweeperTimer = setInterval(() => {
      const timeoutMs = this.config.idleTimeoutMs ?? 1_800_000
      if (timeoutMs <= 0) return // 0 = never expire

      const now = Date.now()
      for (const [id, session] of this.sessions) {
        if (now - session.lastActivityAt > timeoutMs) {
          console.log(`[SessionManager] Destroying idle session: ${id}`)
          this.destroySession(id).catch((err) => {
            console.warn(`[SessionManager] Failed to destroy idle session ${id}:`, err)
          })
        }
      }
    }, intervalMs)

    // Don't prevent process exit
    if (this.sweeperTimer.unref) {
      this.sweeperTimer.unref()
    }
  }

  /**
   * Stop the idle sweeper.
   */
  stopIdleSweeper(): void {
    if (this.sweeperTimer) {
      clearInterval(this.sweeperTimer)
      this.sweeperTimer = null
    }
  }

  /**
   * Handle a new WebSocket connection for a session.
   */
  handleWebSocketConnection(ws: any, sessionId: string, _token?: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      ws.close(4004, 'Session not found')
      return
    }

    session.context.wsConnections.add(ws)
    this.touchSession(sessionId)

    ws.addEventListener('close', () => {
      session.context.wsConnections.delete(ws)
    })
  }

  /**
   * Handle an incoming WebSocket message for a session.
   */
  handleWebSocketMessage(ws: any, message: any): void {
    // V1: no-op. V2 will handle user_message/interrupt/permission_response
    console.log('[WS] Message received (not yet handled):', typeof message)
  }

  /**
   * Handle WebSocket close for a session.
   */
  handleWebSocketClose(ws: any): void {
    // Remove from all sessions (should only be in one)
    for (const session of this.sessions.values()) {
      session.context.wsConnections.delete(ws)
    }
  }
}
