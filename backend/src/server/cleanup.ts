/**
 * cleanup.ts — Session resource cleanup utilities
 *
 * Provides functions for gracefully tearing down session resources:
 * MCP connections, WebSocket connections, abort controllers, and timers.
 */

/**
 * Safely close a WebSocket connection with a reason.
 */
export function closeWebSocket(ws: any, reason: string = 'session_cleanup'): void {
  try {
    if (ws && typeof ws.close === 'function') {
      ws.close(1000, reason)
    }
  } catch {
    // Ignore errors during close — the socket may already be closed
  }
}

/**
 * Close all WebSocket connections in a set.
 */
export function closeAllWebSockets(
  connections: Set<any>,
  reason: string = 'session_cleanup',
): void {
  for (const ws of connections) {
    closeWebSocket(ws, reason)
  }
  connections.clear()
}

/**
 * Close all MCP client connections.
 */
export async function closeMcpClients(clients: any[]): Promise<void> {
  const results = await Promise.allSettled(
    clients.map(async (client) => {
      try {
        if (client && typeof client.close === 'function') {
          await client.close()
        } else if (client && typeof client.disconnect === 'function') {
          await client.disconnect()
        }
      } catch {
        // Best-effort close
      }
    }),
  )

  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    console.warn(`[Cleanup] ${failures.length} MCP client(s) failed to close`)
  }
}

/**
 * Abort an AbortController and clear any timers.
 */
export function abortSession(abortController: AbortController): void {
  try {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  } catch {
    // Already aborted — ignore
  }
}

/**
 * Full session cleanup: close all resources in order.
 */
export async function cleanupSessionResources(resources: {
  wsConnections: Set<any>
  mcpClients: any[]
  abortController: AbortController
}): Promise<void> {
  // 1. Abort ongoing operations
  abortSession(resources.abortController)

  // 2. Close WebSocket connections
  closeAllWebSockets(resources.wsConnections, 'session_destroyed')

  // 3. Close MCP clients
  await closeMcpClients(resources.mcpClients)
}

/**
 * Run cleanup with a timeout. If cleanup doesn't complete within the timeout,
 * log a warning and resolve anyway (don't hang the process).
 */
export async function cleanupWithTimeout(
  cleanupFn: () => Promise<void>,
  timeoutMs: number = 5000,
): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('[Cleanup] Cleanup timed out, forcing resolve')
      resolve()
    }, timeoutMs).unref?.()
  })

  await Promise.race([cleanupFn(), timeout])
}
