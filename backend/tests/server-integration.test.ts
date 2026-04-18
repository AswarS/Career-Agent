/**
 * server-integration.test.ts — Server integration tests
 *
 * Tests cover:
 * 1. SessionContext ALS isolation
 * 2. isHeadless flag
 * 3. getIsHeadless() accessor
 * 4. End-to-end lifecycle
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getSessionContext,
  runWithSessionContext,
  isServerMode,
} from '../src/server/SessionContext.js'
import type { SessionContext, SessionConfig } from '../src/server/SessionContext.js'
import { createIsolatedState, resetStateForTests } from '../src/bootstrap/state.js'
import { createSignal } from '../src/utils/signal.js'
import { parseServerConfig } from '../src/server/config.js'
import { SessionManager } from '../src/server/SessionManager.js'
import type { ServerConfig } from '../src/server/types.js'
import type { SessionId } from '../src/types/ids.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(apiKey: string, baseUrl?: string): SessionContext {
  const state = createIsolatedState()
  return {
    sessionId: state.sessionId,
    state,
    config: { cwd: '/test', apiKey, baseUrl },
    anthropicClient: null as any,
    queryEngine: null as any,
    mcpClients: [],
    wsConnections: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    isHeadless: true as const,
    sessionSwitched: createSignal<[id: SessionId]>(),
  }
}

const TEST_CONFIG: ServerConfig = {
  port: 9091,
  host: '127.0.0.1',
  authToken: 'integration-test-token',
  maxSessions: 10,
  idleTimeoutMs: 60_000,
  workspace: '/tmp/integration-test-workspace',
}

// ===========================================================================
// 1. ALS context isolation
// ===========================================================================
describe('server mode ALS context isolation', () => {
  test('getSessionContext returns undefined outside ALS', () => {
    expect(getSessionContext()).toBeUndefined()
  })

  test('getSessionContext returns the context inside runWithSessionContext', () => {
    const ctx = makeCtx('sk-test')
    let captured: SessionContext | undefined
    runWithSessionContext(ctx, () => {
      captured = getSessionContext()
    })
    expect(captured).toBe(ctx)
  })

  test('session config.apiKey is accessible inside ALS context', () => {
    const ctx = makeCtx('sk-my-key')
    let apiKey: string | undefined
    runWithSessionContext(ctx, () => {
      apiKey = getSessionContext()?.config.apiKey
    })
    expect(apiKey).toBe('sk-my-key')
  })

  test('isServerMode returns false outside ALS context', () => {
    expect(isServerMode()).toBe(false)
  })

  test('isServerMode returns true inside ALS context', () => {
    const ctx = makeCtx('sk-key')
    let result: boolean = false
    runWithSessionContext(ctx, () => {
      result = isServerMode()
    })
    expect(result).toBe(true)
  })

  test('different sessions have independent anthropicClient slots', () => {
    const ctxA = makeCtx('sk-a')
    const ctxB = makeCtx('sk-b')

    const mockClientA = { _tag: 'clientA' } as any
    ctxA.anthropicClient = mockClientA

    let clientInsideA: any
    runWithSessionContext(ctxA, () => {
      clientInsideA = getSessionContext()?.anthropicClient
    })

    let clientInsideB: any
    runWithSessionContext(ctxB, () => {
      clientInsideB = getSessionContext()?.anthropicClient
    })

    expect(clientInsideA).toBe(mockClientA)
    expect(clientInsideB).toBeNull()
  })

  test('ALS context is cleaned up after runWithSessionContext returns', () => {
    const ctx = makeCtx('sk-cleanup')
    runWithSessionContext(ctx, () => {
      expect(getSessionContext()).toBe(ctx)
    })
    expect(getSessionContext()).toBeUndefined()
  })

  test('runWithSessionContext propagates return value', () => {
    const ctx = makeCtx('sk-return')
    const result = runWithSessionContext(ctx, () => 42)
    expect(result).toBe(42)
  })

  test('runWithSessionContext propagates thrown errors', () => {
    const ctx = makeCtx('sk-error')
    expect(() => {
      runWithSessionContext(ctx, () => {
        throw new Error('test-error')
      })
    }).toThrow('test-error')
  })

  test('after error, ALS is still cleaned up', () => {
    const ctx = makeCtx('sk-error-cleanup')
    try {
      runWithSessionContext(ctx, () => { throw new Error('boom') })
    } catch { /* swallow */ }
    expect(getSessionContext()).toBeUndefined()
  })
})

// ===========================================================================
// 2. isHeadless flag
// ===========================================================================
describe('isHeadless flag', () => {
  test('SessionContext.isHeadless is always true when created via makeCtx', () => {
    const ctx = makeCtx('sk-headless')
    expect(ctx.isHeadless).toBe(true)
  })

  test('SessionManager.createSession always sets isHeadless to true', async () => {
    const mgr = new SessionManager(TEST_CONFIG)
    const { context } = await mgr.createSession()
    expect(context.isHeadless).toBe(true)
  })

  test('getSessionContext()?.isHeadless is true inside ALS', () => {
    const ctx = makeCtx('sk-headless-als')
    let headless: boolean | undefined
    runWithSessionContext(ctx, () => {
      headless = getSessionContext()?.isHeadless
    })
    expect(headless).toBe(true)
  })
})

// ===========================================================================
// 3. getIsHeadless() accessor
// ===========================================================================
describe('getIsHeadless() accessor', () => {
  // Dynamic import to avoid circular issues
  async function getGetIsHeadless() {
    const state = await import('../src/bootstrap/state.js')
    return state.getIsHeadless
  }

  test('returns true inside server session ALS context', async () => {
    const getIsHeadless = await getGetIsHeadless()
    const ctx = makeCtx('sk-headless-accessor')
    let result: boolean = false
    runWithSessionContext(ctx, () => {
      result = getIsHeadless()
    })
    expect(result).toBe(true)
  })

  test('returns true outside ALS context (non-interactive default)', async () => {
    const getIsHeadless = await getGetIsHeadless()
    // Default state: isInteractive = false
    expect(getIsHeadless()).toBe(true)
  })

  test('returns true for multiple independent sessions', async () => {
    const getIsHeadless = await getGetIsHeadless()
    const mgr = new SessionManager(TEST_CONFIG)
    const s1 = await mgr.createSession()
    const s2 = await mgr.createSession()

    let r1: boolean = false
    let r2: boolean = false

    runWithSessionContext(s1.context, () => { r1 = getIsHeadless() })
    runWithSessionContext(s2.context, () => { r2 = getIsHeadless() })

    expect(r1).toBe(true)
    expect(r2).toBe(true)
  })
})

// ===========================================================================
// 4. End-to-end session lifecycle (no network server)
// ===========================================================================
describe('end-to-end session lifecycle', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
    manager.stopIdleSweeper()
  })

  test('create session with apiKey -> verify config.apiKey', async () => {
    const { context } = await manager.createSession({ apiKey: 'sk-e2e-key' })
    expect(context.config.apiKey).toBe('sk-e2e-key')
  })

  test('sessionId inside ALS matches the created session', async () => {
    const { sessionId, context } = await manager.createSession()
    let capturedId: string | undefined
    runWithSessionContext(context, () => {
      capturedId = getSessionContext()?.sessionId
    })
    expect(capturedId).toBe(sessionId)
  })

  test('destroySession removes the session from manager', async () => {
    const { sessionId } = await manager.createSession()
    expect(manager.getSession(sessionId)).toBeDefined()

    const result = await manager.destroySession(sessionId)
    expect(result).toBe(true)
    expect(manager.getSession(sessionId)).toBeUndefined()
  })

  test('destroySession aborts the AbortController', async () => {
    const { sessionId, context } = await manager.createSession()
    expect(context.abortController.signal.aborted).toBe(false)

    await manager.destroySession(sessionId)
    expect(context.abortController.signal.aborted).toBe(true)
  })

  test('multiple sessions coexist without state leakage', async () => {
    const s1 = await manager.createSession({ apiKey: 'sk-s1', cwd: '/ws/s1' })
    const s2 = await manager.createSession({ apiKey: 'sk-s2', cwd: '/ws/s2' })

    expect(s1.context.config.apiKey).toBe('sk-s1')
    expect(s2.context.config.apiKey).toBe('sk-s2')
    expect(s1.context.state.cwd).not.toBe(s2.context.state.cwd)

    s1.context.state.totalCostUSD = 999.99
    expect(s2.context.state.totalCostUSD).toBe(0)

    await manager.destroySession(s1.sessionId)
    expect(manager.getSession(s2.sessionId)).toBeDefined()
  })

  test('createSession with permissions sets config.permissions correctly', async () => {
    const { context } = await manager.createSession({
      apiKey: 'sk-perm',
      permissions: { mode: 'deny_dangerous', deniedTools: ['rm'] },
    })

    expect(context.config.permissions?.mode).toBe('deny_dangerous')
    expect(context.config.permissions?.deniedTools).toEqual(['rm'])
  })

  test('workspace falls back to config.workspace when cwd not specified', async () => {
    const { context } = await manager.createSession()
    expect(context.config.cwd).toBe(TEST_CONFIG.workspace)
  })

  test('session cwd override takes precedence over workspace default', async () => {
    const { context } = await manager.createSession({ cwd: '/custom/path' })
    expect(context.config.cwd).toBe('/custom/path')
  })

  test('destroyAllSessions returns the correct count', async () => {
    await manager.createSession({ apiKey: 'sk-1' })
    await manager.createSession({ apiKey: 'sk-2' })
    await manager.createSession({ apiKey: 'sk-3' })

    const count = await manager.destroyAllSessions()
    expect(count).toBe(3)
    expect(manager.getAllSessions().size).toBe(0)
  })

  test('touchSession updates lastActivityAt', async () => {
    const { sessionId } = await manager.createSession()
    const before = manager.getSession(sessionId)!.lastActivityAt

    const start = Date.now()
    while (Date.now() === start) { /* spin */ }

    manager.touchSession(sessionId)
    const after = manager.getSession(sessionId)!.lastActivityAt
    expect(after).toBeGreaterThanOrEqual(before)
  })
})
