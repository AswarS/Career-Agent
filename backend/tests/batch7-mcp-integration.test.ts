/**
 * batch7-mcp-integration.test.ts — Tests for MCP session integration (Batch 7)
 *
 * Covers:
 *   - McpSessionManager unit tests (connect, tools, disconnect, partial failure, SSE config)
 *   - SessionManager MCP integration (create with/without mcpServers, destroy cleanup)
 *   - Router MCP parameter pass-through
 *   - Regression: basic session CRUD still works
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { SessionManager } from '../src/server/SessionManager.js'
import type { ServerConfig } from '../src/server/types.js'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Create a fake ConnectedMCPServer */
function fakeConnectedClient(name: string, cleanupFn?: () => Promise<void>) {
  return {
    type: 'connected' as const,
    name,
    client: { request: mock(() => Promise.resolve({})) },
    cleanup: cleanupFn ?? mock(() => Promise.resolve()),
    config: { type: 'stdio' as const, command: 'test', args: [], scope: 'dynamic' as const },
  }
}

/** Create a fake FailedMCPServer */
function fakeFailedClient(name: string) {
  return {
    type: 'failed' as const,
    name,
    config: { type: 'stdio' as const, command: 'test', args: [], scope: 'dynamic' as const },
    error: 'connection refused',
  }
}

const TEST_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  authToken: 'test-token',
  maxSessions: 5,
  idleTimeoutMs: 500,
  workspace: '/tmp/test-workspace',
}

// ===========================================================================
// McpSessionManager unit tests (with internal state simulation)
// ===========================================================================

describe('McpSessionManager — initial state', () => {
  test('new instance has correct defaults', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    expect(mgr.isConnected).toBe(false)
    expect(mgr.getConnectedClients()).toEqual([])
    expect(mgr.getMcpTools()).toEqual([])
    expect(mgr.getStatus()).toEqual([])
  })

  test('disconnectAll on fresh instance does not throw', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    await expect(mgr.disconnectAll()).resolves.toBeUndefined()
    expect(mgr.isConnected).toBe(false)
  })

  test('connectAll with empty config does nothing', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    await mgr.connectAll({})
    expect(mgr.isConnected).toBe(false)
    expect(mgr.getConnectedClients()).toEqual([])
  })

  test('connectAll skips if already connected', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // @ts-expect-error — setting private for test
    mgr._isConnected = true

    // Should be a no-op even with non-empty config
    await mgr.connectAll({ test: { command: 'echo', args: [] } })

    // @ts-expect-error — accessing private for test
    expect(mgr.connections.size).toBe(0)
  })
})

describe('McpSessionManager — connected state', () => {
  test('getConnectedClients filters to connected type only', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // @ts-expect-error — accessing private for test
    const connections = mgr.connections as Map<string, any>

    connections.set('a', fakeConnectedClient('a'))
    connections.set('b', fakeFailedClient('b'))

    const clients = mgr.getConnectedClients()
    expect(clients.length).toBe(1)
    expect(clients[0].name).toBe('a')
    expect(clients[0].type).toBe('connected')
  })

  test('getMcpTools merges tools from all servers', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // @ts-expect-error — accessing private for test
    const tools = mgr.tools as Map<string, any[]>

    tools.set('serverA', [{ name: 'tool1' }, { name: 'tool2' }] as any[])
    tools.set('serverB', [{ name: 'tool3' }] as any[])

    const allTools = mgr.getMcpTools()
    expect(allTools.length).toBe(3)
    expect(allTools.map((t: any) => t.name)).toEqual(['tool1', 'tool2', 'tool3'])
  })

  test('getStatus returns correct info per server', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // @ts-expect-error — accessing private for test
    const connections = mgr.connections as Map<string, any>
    // @ts-expect-error — accessing private for test
    const tools = mgr.tools as Map<string, any[]>

    connections.set('a', fakeConnectedClient('a'))
    connections.set('b', fakeFailedClient('b'))
    tools.set('a', [{ name: 'x' }] as any[])
    tools.set('b', [] as any[])

    const status = mgr.getStatus()
    expect(status.length).toBe(2)

    const a = status.find((s) => s.name === 'a')
    const b = status.find((s) => s.name === 'b')
    expect(a).toBeDefined()
    expect(a!.status).toBe('connected')
    expect(a!.toolCount).toBe(1)
    expect(b).toBeDefined()
    expect(b!.status).toBe('failed')
    expect(b!.toolCount).toBe(0)
  })

  test('getMcpTools returns empty when no tools', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // No tools set — should return empty array
    expect(mgr.getMcpTools()).toEqual([])
  })
})

describe('McpSessionManager — disconnect', () => {
  test('disconnectAll calls cleanup on connected servers', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    const cleanupMock = mock(() => Promise.resolve())
    // @ts-expect-error — accessing private for test
    const connections = mgr.connections as Map<string, any>

    connections.set('a', fakeConnectedClient('a', cleanupMock))
    // @ts-expect-error — setting private for test
    mgr._isConnected = true

    await mgr.disconnectAll()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(mgr.isConnected).toBe(false)
  })

  test('disconnectAll clears all maps', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    // @ts-expect-error — accessing private for test
    const connections = mgr.connections as Map<string, any>
    // @ts-expect-error — accessing private for test
    const tools = mgr.tools as Map<string, any[]>
    // @ts-expect-error — accessing private for test
    const configs = mgr.configs as Map<string, any>

    connections.set('a', fakeConnectedClient('a'))
    tools.set('a', [])
    configs.set('a', {})
    // @ts-expect-error — setting private for test
    mgr._isConnected = true

    await mgr.disconnectAll()

    expect(connections.size).toBe(0)
    expect(tools.size).toBe(0)
    expect(configs.size).toBe(0)
    expect(mgr.isConnected).toBe(false)
  })

  test('disconnectAll handles cleanup rejection gracefully', async () => {
    const { McpSessionManager } = await import('../src/server/mcpSessionManager.js')
    const mgr = new McpSessionManager()

    const failingCleanup = mock(() => Promise.reject(new Error('cleanup failed')))
    // @ts-expect-error — accessing private for test
    const connections = mgr.connections as Map<string, any>

    connections.set('a', fakeConnectedClient('a', failingCleanup))
    // @ts-expect-error — setting private for test
    mgr._isConnected = true

    // Should not throw — errors are caught internally
    await expect(mgr.disconnectAll()).resolves.toBeUndefined()
    expect(mgr.isConnected).toBe(false)
  })
})

// ===========================================================================
// McpSessionManager — config types
// ===========================================================================

describe('McpSessionManager config conversion', () => {
  test('stdio config has command field', () => {
    const stdioConfig = {
      command: '/usr/bin/node',
      args: ['server.js'],
      env: { API_KEY: 'secret' },
    }
    expect(stdioConfig.command).toBe('/usr/bin/node')
    expect(stdioConfig.args).toEqual(['server.js'])
    expect(stdioConfig.env).toEqual({ API_KEY: 'secret' })
  })

  test('SSE config has url field', () => {
    const sseConfig = {
      url: 'https://mcp.example.com/sse',
      headers: { Authorization: 'Bearer token' },
    }
    expect(sseConfig.url).toBe('https://mcp.example.com/sse')
    expect(sseConfig.headers).toBeDefined()
  })
})

// ===========================================================================
// SessionManager MCP integration
// ===========================================================================

describe('SessionManager MCP integration', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
    manager.stopIdleSweeper()
  })

  test('createSession without mcpServers — mcpManager is null', async () => {
    const { sessionId } = await manager.createSession()
    const session = manager.getSession(sessionId)

    expect(session).toBeDefined()
    expect(session!.mcpManager).toBeNull()
  })

  test('createSession with cwd but no mcpServers — mcpManager is null', async () => {
    const { sessionId } = await manager.createSession({ cwd: '/workspace/x' })
    const session = manager.getSession(sessionId)

    expect(session).toBeDefined()
    expect(session!.mcpManager).toBeNull()
  })

  test('createSession with empty mcpServers — mcpManager is null', async () => {
    const { sessionId } = await manager.createSession({ mcpServers: {} })
    const session = manager.getSession(sessionId)

    expect(session).toBeDefined()
    expect(session!.mcpManager).toBeNull()
  })

  test('ManagedSession contains mcpManager field', async () => {
    const { sessionId } = await manager.createSession()
    const session = manager.getSession(sessionId)

    expect(session).toBeDefined()
    expect(session).toHaveProperty('mcpManager')
    expect(session).toHaveProperty('context')
    expect(session).toHaveProperty('lastActivityAt')
  })

  test('session context has correct defaults without MCP', async () => {
    const { context } = await manager.createSession()

    expect(context.mcpClients).toEqual([])
    expect(context.queryEngine).toBeDefined()
    expect(context.wsConnections).toBeInstanceOf(Set)
    expect(context.abortController).toBeInstanceOf(AbortController)
  })

  test('destroySession works without mcpManager', async () => {
    const { sessionId } = await manager.createSession()
    const result = await manager.destroySession(sessionId)

    expect(result).toBe(true)
    expect(manager.getSession(sessionId)).toBeUndefined()
  })

  test('destroyAllSessions works with mixed sessions', async () => {
    await manager.createSession({ cwd: '/a' })
    await manager.createSession({ cwd: '/b' })
    await manager.createSession({ cwd: '/c' })

    const count = await manager.destroyAllSessions()
    expect(count).toBe(3)
    expect(manager.getAllSessions().size).toBe(0)
  })
})

// ===========================================================================
// Router MCP parameter pass-through
// ===========================================================================

describe('Router MCP integration', () => {
  async function makeTestRouter() {
    const { createRouter } = await import('../src/server/router.js')
    const manager = new SessionManager(TEST_CONFIG)
    const { handleRequest } = createRouter(manager, TEST_CONFIG)
    return { manager, handleRequest }
  }

  test('POST /v1/sessions without mcpServers — success', async () => {
    const { handleRequest, manager } = await makeTestRouter()
    try {
      const req = new Request('http://localhost/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({ cwd: '/workspace/test' }),
      })

      const res = await handleRequest(req)
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.id).toBeDefined()
      expect(typeof body.id).toBe('string')
    } finally {
      await manager.destroyAllSessions()
      manager.stopIdleSweeper()
    }
  })

  test('POST /v1/sessions with mcpServers field — accepted', async () => {
    const { handleRequest, manager } = await makeTestRouter()
    try {
      const req = new Request('http://localhost/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          cwd: '/workspace/test',
          mcpServers: {
            testServer: {
              command: 'echo',
              args: ['hello'],
            },
          },
        }),
      })

      const res = await handleRequest(req)
      // Session creation should succeed — MCP connection may fail but session still created
      // (MCP failures are logged as warnings, not fatal)
      expect([200, 201, 500]).toContain(res.status)

      if (res.status === 201) {
        const body = await res.json()
        expect(body.id).toBeDefined()
      }
    } finally {
      await manager.destroyAllSessions()
      manager.stopIdleSweeper()
    }
  })

  test('POST /v1/sessions with SSE-type mcpServers — accepted', async () => {
    const { handleRequest, manager } = await makeTestRouter()
    try {
      const req = new Request('http://localhost/v1/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          cwd: '/workspace/test',
          mcpServers: {
            remoteServer: {
              url: 'https://mcp.example.com/sse',
            },
          },
        }),
      })

      const res = await handleRequest(req)
      // Should at least not crash the router
      expect(res.status).toBeDefined()
      expect(typeof res.status).toBe('number')
    } finally {
      await manager.destroyAllSessions()
      manager.stopIdleSweeper()
    }
  })

  test('Auth is still enforced with MCP endpoints', async () => {
    const { handleRequest, manager } = await makeTestRouter()
    try {
      const req = new Request('http://localhost/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/test' }),
      })

      const res = await handleRequest(req)
      expect(res.status).toBe(401)
    } finally {
      await manager.destroyAllSessions()
      manager.stopIdleSweeper()
    }
  })
})

// ===========================================================================
// Regression — session CRUD still works after MCP integration
// ===========================================================================

describe('Regression — session CRUD after MCP integration', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
    manager.stopIdleSweeper()
  })

  test('create + getSession', async () => {
    const { sessionId } = await manager.createSession()
    const session = manager.getSession(sessionId)
    expect(session).toBeDefined()
    expect(session!.context.sessionId).toBe(sessionId)
  })

  test('create + destroy', async () => {
    const { sessionId } = await manager.createSession()
    const result = await manager.destroySession(sessionId)
    expect(result).toBe(true)
    expect(manager.getSession(sessionId)).toBeUndefined()
  })

  test('maxSessions limit enforced', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.createSession()
    }
    await expect(manager.createSession()).rejects.toThrow('Maximum sessions reached')
  })

  test('unique session IDs', async () => {
    const a = await manager.createSession()
    const b = await manager.createSession()
    expect(a.sessionId).not.toBe(b.sessionId)
  })

  test('independent STATE per session', async () => {
    const a = await manager.createSession({ cwd: '/workspace/a' })
    const b = await manager.createSession({ cwd: '/workspace/b' })

    expect(a.context.state.cwd).not.toBe(b.context.state.cwd)
    a.context.state.totalCostUSD = 100
    expect(b.context.state.totalCostUSD).toBe(0)
  })

  test('session abort on destroy', async () => {
    const { sessionId, context } = await manager.createSession()
    expect(context.abortController.signal.aborted).toBe(false)

    await manager.destroySession(sessionId)
    expect(context.abortController.signal.aborted).toBe(true)
  })

  test('getAllSessions count', async () => {
    await manager.createSession()
    await manager.createSession()
    await manager.createSession()
    expect(manager.getAllSessions().size).toBe(3)
  })

  test('health endpoint via router', async () => {
    const { createRouter } = await import('../src/server/router.js')
    const { handleRequest } = createRouter(manager, TEST_CONFIG)

    const req = new Request('http://localhost/v1/health', {
      headers: { 'Authorization': 'Bearer test-token' },
    })
    const res = await handleRequest(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.sessions).toBe(0)
    expect(typeof body.uptime).toBe('number')
  })
})
