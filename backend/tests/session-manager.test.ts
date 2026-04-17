/**
 * session-manager.test.ts — Tests for SessionManager
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { SessionManager } from '../src/server/SessionManager.js'
import { runWithSessionContext, getSessionContext, isServerMode } from '../src/server/SessionContext.js'
import type { ServerConfig } from '../src/server/types.js'

const TEST_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  authToken: 'test-token',
  maxSessions: 5,
  idleTimeoutMs: 500, // Short for testing
  workspace: '/tmp/test-workspace',
}

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
    manager.stopIdleSweeper()
  })

  test('createSession returns valid session with unique ID', () => {
    const { sessionId, context } = manager.createSession()
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
    expect(context.sessionId).toBe(sessionId)
    expect(context.isHeadless).toBe(true)
    expect(context.state).toBeDefined()
    expect(context.wsConnections).toBeInstanceOf(Set)
    expect(context.wsConnections.size).toBe(0)
  })

  test('each session gets a unique ID', () => {
    const a = manager.createSession()
    const b = manager.createSession()
    expect(a.sessionId).not.toBe(b.sessionId)
  })

  test('each session gets independent STATE', () => {
    const a = manager.createSession({ cwd: '/workspace/a' })
    const b = manager.createSession({ cwd: '/workspace/b' })

    expect(a.context.state.cwd).not.toBe(b.context.state.cwd)
    expect(a.context.state.totalCostUSD).toBe(0)
    a.context.state.totalCostUSD = 100
    expect(b.context.state.totalCostUSD).toBe(0)
  })

  test('getSession retrieves created session', () => {
    const { sessionId } = manager.createSession()
    const session = manager.getSession(sessionId)
    expect(session).toBeDefined()
    expect(session!.context.sessionId).toBe(sessionId)
  })

  test('getSession returns undefined for unknown ID', () => {
    expect(manager.getSession('nonexistent')).toBeUndefined()
  })

  test('getAllSessions returns all sessions', () => {
    manager.createSession()
    manager.createSession()
    manager.createSession()
    expect(manager.getAllSessions().size).toBe(3)
  })

  test('destroySession removes the session', async () => {
    const { sessionId } = manager.createSession()
    expect(manager.getSession(sessionId)).toBeDefined()

    const result = await manager.destroySession(sessionId)
    expect(result).toBe(true)
    expect(manager.getSession(sessionId)).toBeUndefined()
  })

  test('destroySession returns false for unknown session', async () => {
    const result = await manager.destroySession('nonexistent')
    expect(result).toBe(false)
  })

  test('destroyAllSessions removes all sessions', async () => {
    manager.createSession()
    manager.createSession()
    manager.createSession()

    const count = await manager.destroyAllSessions()
    expect(count).toBe(3)
    expect(manager.getAllSessions().size).toBe(0)
  })

  test('maxSessions limit is enforced', () => {
    for (let i = 0; i < 5; i++) {
      manager.createSession()
    }
    expect(() => manager.createSession()).toThrow('Maximum sessions reached')
  })

  test('session context is usable with ALS', () => {
    const { sessionId, context } = manager.createSession()

    let capturedId: string | undefined
    let capturedIsServer: boolean = false

    runWithSessionContext(context, () => {
      capturedId = getSessionContext()?.sessionId
      capturedIsServer = isServerMode()
    })

    expect(capturedId).toBe(sessionId)
    expect(capturedIsServer).toBe(true)
    expect(isServerMode()).toBe(false) // Outside context
  })

  test('session options are applied to config', () => {
    const { context } = manager.createSession({
      apiKey: 'sk-test-key',
      baseUrl: 'https://custom-api.example.com',
      provider: 'firstParty',
      model: 'claude-3-opus',
      permissions: { mode: 'deny_dangerous' },
    })

    expect(context.config.apiKey).toBe('sk-test-key')
    expect(context.config.baseUrl).toBe('https://custom-api.example.com')
    expect(context.config.provider).toBe('firstParty')
    expect(context.config.model).toBe('claude-3-opus')
    expect(context.config.permissions?.mode).toBe('deny_dangerous')
  })

  test('touchSession updates lastActivityAt', () => {
    const { sessionId } = manager.createSession()
    const before = manager.getSession(sessionId)!.lastActivityAt

    // Wait a tiny bit
    const start = Date.now()
    while (Date.now() === start) {} // Spin until time advances

    manager.touchSession(sessionId)
    const after = manager.getSession(sessionId)!.lastActivityAt
    expect(after).toBeGreaterThanOrEqual(before)
  })

  test('destroyed session aborts its AbortController', async () => {
    const { sessionId, context } = manager.createSession()
    expect(context.abortController.signal.aborted).toBe(false)

    await manager.destroySession(sessionId)
    expect(context.abortController.signal.aborted).toBe(true)
  })

  test('handleWebSocketConnection adds ws to session', () => {
    const { sessionId } = manager.createSession()
    const ws = { close: () => {}, addEventListener: () => {} }

    manager.handleWebSocketConnection(ws, sessionId)
    const session = manager.getSession(sessionId)
    expect(session!.context.wsConnections.has(ws)).toBe(true)
  })

  test('handleWebSocketConnection rejects unknown session', () => {
    let closeArgs: any[] = []
    const ws = { close: (...args: any[]) => { closeArgs = args } }

    manager.handleWebSocketConnection(ws, 'nonexistent')
    expect(closeArgs[0]).toBe(4004)
  })
})
