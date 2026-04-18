/**
 * mcpSessionManager.ts — Per-session MCP server connection management
 *
 * Handles the lifecycle of MCP server connections for each server session.
 * Supports stdio and sse/ws/http MCP server types.
 *
 * Flow:
 *   1. Session created with optional mcpServers config
 *   2. connectAll() establishes connections and discovers tools
 *   3. getConnectedClients() returns live connections for QueryEngine
 *   4. getMcpTools() returns discovered MCP tools
 *   5. disconnectAll() cleans up on session destroy
 */

import { connectToServer, fetchToolsForClient } from '../services/mcp/client.js'
import type { MCPServerConnection, ScopedMcpServerConfig } from '../services/mcp/types.js'
import type { Tool } from '../Tool.js'

export type SessionMcpServerConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type SessionMcpSseConfig = {
  url: string
  headers?: Record<string, string>
}

export type SessionMcpConfig = SessionMcpServerConfig | SessionMcpSseConfig

/**
 * Converts a simplified SessionMcpConfig to the internal ScopedMcpServerConfig
 * used by connectToServer.
 */
function toScopedConfig(
  name: string,
  config: SessionMcpConfig,
): ScopedMcpServerConfig {
  if ('command' in config) {
    return {
      type: 'stdio',
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      scope: 'dynamic',
    }
  }
  // SSE config
  return {
    type: 'sse',
    url: config.url,
    scope: 'dynamic',
  }
}

export class McpSessionManager {
  private connections: Map<string, MCPServerConnection> = new Map()
  private tools: Map<string, Tool[]> = new Map()
  private configs: Map<string, ScopedMcpServerConfig> = new Map()
  private _isConnected = false

  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * Connect to all configured MCP servers and discover tools.
   * Safe to call multiple times — skips if already connected.
   */
  async connectAll(
    mcpServers: Record<string, SessionMcpConfig>,
  ): Promise<void> {
    if (this._isConnected) return

    const entries = Object.entries(mcpServers)
    if (entries.length === 0) return

    // Connect to each server in parallel
    const results = await Promise.allSettled(
      entries.map(async ([name, config]) => {
        const scopedConfig = toScopedConfig(name, config)
        this.configs.set(name, scopedConfig)

        const connection = await connectToServer(name, scopedConfig)
        this.connections.set(name, connection)

        if (connection.type === 'connected') {
          const serverTools = await fetchToolsForClient(connection)
          this.tools.set(name, serverTools)
        } else {
          console.warn(
            `[McpSessionManager] Server "${name}" connection status: ${connection.type}`,
          )
          this.tools.set(name, [])
        }
      }),
    )

    // Log failures
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') continue
      const name = entries[i][0]
      console.warn(
        `[McpSessionManager] Failed to connect to "${name}":`,
        results[i].reason,
      )
    }

    this._isConnected = true
  }

  /**
   * Get all successfully connected MCP clients for QueryEngine consumption.
   */
  getConnectedClients(): MCPServerConnection[] {
    const connected: MCPServerConnection[] = []
    for (const [, conn] of this.connections) {
      if (conn.type === 'connected') {
        connected.push(conn)
      }
    }
    return connected
  }

  /**
   * Get all discovered MCP tools across all connected servers.
   */
  getMcpTools(): Tool[] {
    const allTools: Tool[] = []
    for (const [, serverTools] of this.tools) {
      allTools.push(...serverTools)
    }
    return allTools
  }

  /**
   * Get connection status info for each configured server.
   */
  getStatus(): Array<{
    name: string
    status: string
    toolCount: number
  }> {
    const result: Array<{ name: string; status: string; toolCount: number }> = []
    for (const [name, conn] of this.connections) {
      result.push({
        name,
        status: conn.type,
        toolCount: this.tools.get(name)?.length ?? 0,
      })
    }
    return result
  }

  /**
   * Disconnect from all MCP servers and release resources.
   */
  async disconnectAll(): Promise<void> {
    const cleanups: Promise<void>[] = []

    for (const [name, conn] of this.connections) {
      if (conn.type === 'connected' && conn.cleanup) {
        cleanups.push(
          conn.cleanup().catch((err) => {
            console.warn(
              `[McpSessionManager] Failed to cleanup "${name}":`,
              err,
            )
          }),
        )
      }
    }

    await Promise.allSettled(cleanups)

    this.connections.clear()
    this.tools.clear()
    this.configs.clear()
    this._isConnected = false
  }
}
