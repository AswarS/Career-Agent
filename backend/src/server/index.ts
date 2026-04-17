/**
 * index.ts — Bun.serve entry point for multi-user HTTP API server
 *
 * Combines HTTP REST API with WebSocket support in a single Bun.serve instance.
 * Handles graceful shutdown, idle session cleanup, and request routing.
 */

import { parseServerConfig, DEFAULT_SERVER_CONFIG } from './config.js'
import { SessionManager } from './SessionManager.js'
import { createRouter } from './router.js'
import { handleWsOpen, handleWsMessage } from './wsHandler.js'
import type { ServerConfig } from './types.js'

export async function startServer(rawConfig?: Partial<ServerConfig>): Promise<void> {
  const config = rawConfig ? { ...DEFAULT_SERVER_CONFIG, ...rawConfig } : parseServerConfig()
  const manager = new SessionManager(config)
  const router = createRouter(manager, config)

  // Start idle session sweeper
  if ((config.idleTimeoutMs ?? 0) > 0) {
    manager.startIdleSweeper()
  }

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,

    async fetch(req, server) {
      // WebSocket upgrade
      const url = new URL(req.url)
      if (url.pathname.startsWith('/v1/sessions/') && url.pathname.endsWith('/ws')) {
        const sessionId = url.pathname.split('/')[3] // /v1/sessions/:id/ws
        const upgraded = server.upgrade(req, { data: { sessionId } })
        if (upgraded) return // WebSocket handled
      }

      // HTTP REST API
      return router.handleRequest(req)
    },

    websocket: {
      open(ws) {
        const { sessionId } = ws.data as { sessionId: string }
        manager.handleWebSocketConnection(ws, sessionId)
        handleWsOpen(ws, sessionId)
      },

      message(ws, message) {
        const { sessionId } = ws.data as { sessionId: string }
        handleWsMessage(ws, message as string | Buffer | ArrayBuffer, manager, sessionId)
      },

      close(ws) {
        manager.handleWebSocketClose(ws)
      },
    },
  })

  console.log(`[Server] Listening on http://${config.host}:${config.port}`)
  console.log(`[Server] Max sessions: ${config.maxSessions ?? 100}`)
  if (config.authToken) {
    console.log('[Server] Authentication: enabled')
  } else {
    console.log('[Server] Authentication: disabled')
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down...')
    manager.stopIdleSweeper()
    const count = await manager.destroyAllSessions()
    console.log(`[Server] Destroyed ${count} sessions`)
    server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Auto-start when run directly
if (import.meta.main) {
  startServer().catch((err) => {
    console.error('[Server] Failed to start:', err)
    process.exit(1)
  })
}
