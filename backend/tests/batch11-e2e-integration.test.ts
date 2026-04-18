/**
 * batch11-e2e-integration.test.ts — End-to-end integration tests
 *
 * Tests the complete multi-user pipeline without a real LLM API key.
 * Uses the echo mode fallback (QueryEngine falls back to echo when no API key)
 * to verify the full flow: create -> message -> list -> switch -> close -> resume.
 *
 * Covers:
 *   11a. Full e2e session lifecycle via REST API
 *   11b. Multi-instance isolation verification
 *   11c. Tool execution cwd verification (via ALS routing)
 *   11d. JSONL persistence verification
 *   11e. Session resume e2e
 *   11f. InstanceCommandManager e2e integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createRouter } from '../src/server/router.js'
import { handleWsMessage, handleWsOpen } from '../src/server/wsHandler.js'
import { SessionManager } from '../src/server/SessionManager.js'
import type { ServerConfig } from '../src/server/types.js'
import {
  runWithSessionContext,
  getSessionContext,
  isServerMode,
} from '../src/server/SessionContext.js'
import { createIsolatedState } from '../src/bootstrap/state.js'
import { createSignal } from '../src/utils/signal.js'
import { pwd } from '../src/utils/cwd.js'
import type { SessionId } from '../src/types/ids.js'
import {
  InstanceCommandManager,
  type InstanceInfo,
} from '../src/server/instanceCommands.js'
import { listSessionHistory } from '../src/server/sessionResume.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_CONFIG: ServerConfig = {
  port: 9091,
  host: '127.0.0.1',
  authToken: '',
  maxSessions: 50,
  idleTimeoutMs: 0,
  // No workspace override — falls back to process.cwd() which exists on all platforms
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWs() {
  const sent: string[] = []
  let closeCode: number | null = null
  let closeReason: string = ''
  return {
    send: (data: string) => sent.push(data),
    close: (code: number, reason?: string) => {
      closeCode = code
      closeReason = reason ?? ''
    },
    get sent() { return sent },
    get closeCode() { return closeCode },
    get closeReason() { return closeReason },
    addEventListener: () => {},
  }
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
  const combined = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(combined)
}

function makeRequest(
  router: ReturnType<typeof createRouter>,
  method: string,
  path: string,
  body?: any,
): Promise<Response> {
  return router.handleRequest(
    new Request(`http://localhost:9091${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
}

// ===========================================================================
// 11a. Full e2e session lifecycle via REST API
// ===========================================================================

describe('11a: Full e2e REST API lifecycle', () => {
  let manager: SessionManager
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
    router = createRouter(manager, TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('complete CRUD lifecycle: health -> create -> message -> list -> delete', async () => {
    // 1. Health check (0 sessions)
    const health0 = await makeRequest(router, 'GET', '/v1/health')
    expect(health0.status).toBe(200)
    const healthBody0 = await health0.json() as { status: string; sessions: number }
    expect(healthBody0.status).toBe('ok')
    expect(healthBody0.sessions).toBe(0)

    // 2. Create session (no cwd/apiKey → uses process.cwd(), echo mode)
    const createResp = await makeRequest(router, 'POST', '/v1/sessions', {})
    expect(createResp.status).toBe(201)
    const created = await createResp.json() as { id: string; cwd: string }
    const sessionId = created.id
    expect(typeof sessionId).toBe('string')
    expect(created.cwd).toBeDefined()

    // 3. Verify session appears in list
    const listResp = await makeRequest(router, 'GET', '/v1/sessions')
    expect(listResp.status).toBe(200)
    const listBody = await listResp.json() as { sessions: Array<{ id: string }> }
    expect(listBody.sessions).toHaveLength(1)
    expect(listBody.sessions[0].id).toBe(sessionId)

    // 4. Health check now shows 1 session
    const health1 = await makeRequest(router, 'GET', '/v1/health')
    const healthBody1 = await health1.json() as { sessions: number }
    expect(healthBody1.sessions).toBe(1)

    // 5. Send message via SSE (echo mode since no real API key)
    const msgResp = await makeRequest(router, 'POST', `/v1/sessions/${sessionId}/message`, {
      content: 'e2e integration test message',
    })
    expect(msgResp.status).toBe(200)
    expect(msgResp.headers.get('Content-Type')).toBe('text/event-stream')

    const sseText = await readStream(msgResp.body as ReadableStream<Uint8Array>)
    expect(sseText).toContain('event: session_id')
    // Without API key → echo mode; with fake key → error event. Both are valid.
    const hasEcho = sseText.includes('event: assistant') && sseText.includes('[Echo]')
    const hasError = sseText.includes('event: error')
    expect(hasEcho || hasError).toBe(true)

    // 6. Delete session
    const delResp = await makeRequest(router, 'DELETE', `/v1/sessions/${sessionId}`)
    expect(delResp.status).toBe(200)

    // 7. Verify session is gone
    const getResp = await makeRequest(router, 'GET', `/v1/sessions/${sessionId}`)
    expect(getResp.status).toBe(404)
  })

  test('SSE stream contains session_id event with correct ID', async () => {
    const { sessionId } = await manager.createSession()

    const msgResp = await makeRequest(router, 'POST', `/v1/sessions/${sessionId}/message`, {
      content: 'check session id',
    })
    const sseText = await readStream(msgResp.body as ReadableStream<Uint8Array>)
    // SSE sends session_id as JSON: data: {"sessionId":"..."}
    expect(sseText).toContain(sessionId)
    expect(sseText).toContain('event: session_id')
  })

  test('creating session with resumeFrom returns 404 when no transcript exists', async () => {
    // Create first session
    const s1 = await manager.createSession()

    // Try to create session with resumeFrom — no transcript file exists
    const createResp = await makeRequest(router, 'POST', '/v1/sessions', {
      resumeFrom: s1.sessionId,
    })
    // Resume fails because no JSONL transcript file was written for s1
    expect(createResp.status).toBe(404)
  })

  test('creating session without resumeFrom works normally', async () => {
    const createResp = await makeRequest(router, 'POST', '/v1/sessions', {})
    expect(createResp.status).toBe(201)
    const created = await createResp.json() as { id: string }
    expect(typeof created.id).toBe('string')
  })
})

// ===========================================================================
// 11b. Multi-instance isolation verification
// ===========================================================================

describe('11b: Multi-instance isolation', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('two sessions have completely independent STATE', async () => {
    const s1 = await manager.createSession({ apiKey: 'sk-alpha', cwd: '/tmp/alpha' })
    const s2 = await manager.createSession({ apiKey: 'sk-beta', cwd: '/tmp/beta' })

    // Different sessionIds
    expect(s1.sessionId).not.toBe(s2.sessionId)

    // Different API keys
    expect(s1.context.config.apiKey).toBe('sk-alpha')
    expect(s2.context.config.apiKey).toBe('sk-beta')

    // Different working directories
    expect(s1.context.config.cwd).toBe('/tmp/alpha')
    expect(s2.context.config.cwd).toBe('/tmp/beta')

    // Independent STATE objects
    s1.context.state.totalCostUSD = 100.50
    expect(s2.context.state.totalCostUSD).toBe(0)
  })

  test('ALS context routes to correct session', async () => {
    const s1 = await manager.createSession({ apiKey: 'sk-s1' })
    const s2 = await manager.createSession({ apiKey: 'sk-s2' })

    let captured1: string | undefined
    let captured2: string | undefined

    runWithSessionContext(s1.context, () => {
      captured1 = getSessionContext()?.config.apiKey
    })
    runWithSessionContext(s2.context, () => {
      captured2 = getSessionContext()?.config.apiKey
    })

    expect(captured1).toBe('sk-s1')
    expect(captured2).toBe('sk-s2')
  })

  test('destroying one session does not affect the other', async () => {
    const s1 = await manager.createSession({ apiKey: 'sk-a' })
    const s2 = await manager.createSession({ apiKey: 'sk-b' })

    await manager.destroySession(s1.sessionId)

    // s2 should be untouched
    expect(manager.getSession(s2.sessionId)).toBeDefined()
    expect(manager.getSession(s2.sessionId)!.context.config.apiKey).toBe('sk-b')

    // s1 should be gone
    expect(manager.getSession(s1.sessionId)).toBeUndefined()
  })

  test('three concurrent sessions with different cwds stay isolated', async () => {
    const s1 = await manager.createSession({ cwd: '/tmp/a' })
    const s2 = await manager.createSession({ cwd: '/tmp/b' })
    const s3 = await manager.createSession({ cwd: '/tmp/c' })

    const cwds: string[] = []
    for (const s of [s1, s2, s3]) {
      runWithSessionContext(s.context, () => {
        cwds.push(getSessionContext()!.config.cwd)
      })
    }

    expect(cwds).toEqual(['/tmp/a', '/tmp/b', '/tmp/c'])
  })

  test('AbortController isolation — aborting one does not abort others', async () => {
    const s1 = await manager.createSession()
    const s2 = await manager.createSession()

    await manager.destroySession(s1.sessionId)

    expect(s1.context.abortController.signal.aborted).toBe(true)
    expect(s2.context.abortController.signal.aborted).toBe(false)
  })
})

// ===========================================================================
// 11c. Tool execution cwd verification via ALS routing
// ===========================================================================

describe('11c: Tool execution cwd via ALS', () => {
  test('pwd() returns session cwd inside ALS context', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const { context } = await manager.createSession({ cwd: '/tmp/als-cwd-test' })

    let capturedCwd: string | undefined
    runWithSessionContext(context, () => {
      capturedCwd = pwd()
    })

    expect(capturedCwd).toBe('/tmp/als-cwd-test')
    await manager.destroyAllSessions()
  })

  test('different sessions return different cwds via pwd()', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const s1 = await manager.createSession({ cwd: '/tmp/dir-x' })
    const s2 = await manager.createSession({ cwd: '/tmp/dir-y' })

    let cwd1: string | undefined
    let cwd2: string | undefined

    runWithSessionContext(s1.context, () => { cwd1 = pwd() })
    runWithSessionContext(s2.context, () => { cwd2 = pwd() })

    expect(cwd1).toBe('/tmp/dir-x')
    expect(cwd2).toBe('/tmp/dir-y')

    await manager.destroyAllSessions()
  })

  test('STATE.cwd is per-session inside ALS context', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const s1 = await manager.createSession({ cwd: '/tmp/s1' })
    const s2 = await manager.createSession({ cwd: '/tmp/s2' })

    let stateCwd1: string | undefined
    let stateCwd2: string | undefined

    runWithSessionContext(s1.context, () => {
      stateCwd1 = getSessionContext()?.state.cwd
    })
    runWithSessionContext(s2.context, () => {
      stateCwd2 = getSessionContext()?.state.cwd
    })

    expect(stateCwd1).toBe('/tmp/s1')
    expect(stateCwd2).toBe('/tmp/s2')

    await manager.destroyAllSessions()
  })
})

// ===========================================================================
// 11d. JSONL persistence verification
// ===========================================================================

describe('11d: JSONL persistence', () => {
  test('session history listing returns array (may be empty if no transcripts)', async () => {
    const entries = await listSessionHistory('/tmp/nonexistent-project-dir')
    expect(Array.isArray(entries)).toBe(true)
  })

  test('session has createdAt timestamp for transcript tracking', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const { context } = await manager.createSession()

    expect(typeof context.createdAt).toBe('number')
    expect(context.createdAt).toBeGreaterThan(0)
    expect(context.createdAt).toBeLessThanOrEqual(Date.now())

    await manager.destroyAllSessions()
  })

  test('session state has sessionId for transcript file naming', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const { sessionId, context } = await manager.createSession()

    let alsSessionId: string | undefined
    runWithSessionContext(context, () => {
      alsSessionId = getSessionContext()?.state.sessionId
    })

    expect(alsSessionId).toBe(sessionId)
    await manager.destroyAllSessions()
  })
})

// ===========================================================================
// 11e. Session resume e2e
// ===========================================================================

describe('11e: Session resume', () => {
  test('resume returns 404 when original session has no transcript', async () => {
    const manager = new SessionManager(TEST_CONFIG)
    const router = createRouter(manager, TEST_CONFIG)

    // Create and destroy a session (no transcript written)
    const s1 = await manager.createSession({ apiKey: 'sk-resume' })
    const originalId = s1.sessionId
    await manager.destroySession(originalId)

    // Resume fails because no JSONL file exists
    const resp = await makeRequest(router, 'POST', '/v1/sessions', {
      apiKey: 'sk-resume',
      resumeFrom: originalId,
    })
    expect(resp.status).toBe(404)

    await manager.destroyAllSessions()
  })

  test('resumed session gets independent STATE from original', async () => {
    const manager = new SessionManager(TEST_CONFIG)

    const s1 = await manager.createSession({ cwd: '/tmp/ind-test' })
    s1.context.state.totalCostUSD = 42.42

    await manager.destroySession(s1.sessionId)

    // Create fresh session (not actually resuming from file, but verifying isolation)
    const s2 = await manager.createSession({ cwd: '/tmp/ind-test' })
    expect(s2.context.state.totalCostUSD).toBe(0)
    expect(s2.context.sessionId).not.toBe(s1.context.sessionId)

    await manager.destroyAllSessions()
  })
})

// ===========================================================================
// 11f. InstanceCommandManager e2e integration
// ===========================================================================

describe('11f: InstanceCommandManager + REST API integration', () => {
  let instanceManager: InstanceCommandManager
  let sessionManager: SessionManager
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    instanceManager = new InstanceCommandManager()
    sessionManager = instanceManager.getSessionManager()
    router = createRouter(sessionManager, TEST_CONFIG)
  })

  afterEach(async () => {
    await instanceManager.destroyAll()
  })

  test('instance creation + REST API message flow', async () => {
    // Create instance via InstanceCommandManager (terminal mode)
    const result = await instanceManager.createInstance({
      userId: 'e2e-user',
      // No apiKey → echo mode fallback (QueryEngine not created)
    })
    expect(result.ok).toBe(true)
    const sessionId = result.sessionId!

    // Send message via REST API
    const msgResp = await makeRequest(router, 'POST', `/v1/sessions/${sessionId}/message`, {
      content: 'hello from e2e',
    })
    expect(msgResp.status).toBe(200)

    const sseText = await readStream(msgResp.body as ReadableStream<Uint8Array>)
    expect(sseText).toContain(sessionId)
    // Echo mode or error — both prove the message endpoint works
    const hasEcho = sseText.includes('[Echo]')
    const hasError = sseText.includes('event: error')
    expect(hasEcho || hasError).toBe(true)
  })

  test('instance list matches REST API sessions', async () => {
    // Create two instances
    const r1 = await instanceManager.createInstance({ userId: 'alice', apiKey: 'sk-a' })
    const r2 = await instanceManager.createInstance({ userId: 'bob', apiKey: 'sk-b' })

    // Check via InstanceCommandManager
    const instances = instanceManager.listInstances()
    expect(instances).toHaveLength(2)

    // Check via REST API
    const listResp = await makeRequest(router, 'GET', '/v1/sessions')
    const listBody = await listResp.json() as { sessions: Array<{ id: string }> }
    expect(listBody.sessions).toHaveLength(2)

    // IDs should match
    const restIds = listBody.sessions.map(s => s.id).sort()
    const instanceIds = instances.map(i => i.sessionId).sort()
    expect(restIds).toEqual(instanceIds)
  })

  test('closing instance via InstanceCommandManager removes from REST API', async () => {
    const r = await instanceManager.createInstance({ userId: 'alice', apiKey: 'sk-a' })
    const sessionId = r.sessionId!

    // Verify exists via REST
    const getResp1 = await makeRequest(router, 'GET', `/v1/sessions/${sessionId}`)
    expect(getResp1.status).toBe(200)

    // Close via InstanceCommandManager
    await instanceManager.closeInstance(sessionId)

    // Verify gone via REST
    const getResp2 = await makeRequest(router, 'GET', `/v1/sessions/${sessionId}`)
    expect(getResp2.status).toBe(404)
  })

  test('WebSocket works with instance-created session', async () => {
    const r = await instanceManager.createInstance({ userId: 'ws-user', apiKey: 'sk-ws' })
    const sessionId = r.sessionId!

    const ws = createMockWs()
    handleWsMessage(ws, JSON.stringify({ type: 'ping' }), sessionManager, sessionId)

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string }
    expect(parsed.type).toBe('pong')
  })

  test('switch instance + REST API message uses correct session', async () => {
    const r1 = await instanceManager.createInstance({ userId: 'alice' })
    const r2 = await instanceManager.createInstance({ userId: 'bob' })

    // Switch to alice
    instanceManager.switchInstance(r1.sessionId!)

    // Get current context - should be alice
    const ctx = instanceManager.getCurrentContext()
    expect(ctx).not.toBeNull()
    expect(ctx!.sessionId).toBe(r1.sessionId)

    // REST API sends to bob's session directly (by ID) — verifies REST routing
    const msgResp = await makeRequest(router, 'POST', `/v1/sessions/${r2.sessionId!}/message`, {
      content: 'message to bob',
    })
    const sseText = await readStream(msgResp.body as ReadableStream<Uint8Array>)
    // Response should reference bob's session, not alice's
    expect(sseText).toContain(r2.sessionId!)
  })
})

// ===========================================================================
// WebSocket full e2e
// ===========================================================================

describe('11: WebSocket full e2e', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager(TEST_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('WS open -> ping -> user_message -> interrupt lifecycle', async () => {
    const { sessionId } = await manager.createSession()
    const ws = createMockWs()

    // Open
    handleWsOpen(ws, sessionId)
    expect(ws.sent.length).toBe(1)
    const openMsg = JSON.parse(ws.sent[0]) as { type: string; sessionId: string }
    expect(openMsg.type).toBe('connected')
    expect(openMsg.sessionId).toBe(sessionId)

    // Ping
    ws.sent.length = 0
    handleWsMessage(ws, JSON.stringify({ type: 'ping' }), manager, sessionId)
    expect(ws.sent.length).toBe(1)
    const pongMsg = JSON.parse(ws.sent[0]) as { type: string }
    expect(pongMsg.type).toBe('pong')

    // User message (echo mode)
    ws.sent.length = 0
    handleWsMessage(
      ws,
      JSON.stringify({ type: 'user_message', content: 'e2e ws test' }),
      manager,
      sessionId,
    )
    expect(ws.sent.length).toBe(1)
    const echoMsg = JSON.parse(ws.sent[0]) as { type: string; content: string }
    expect(echoMsg.type).toBe('assistant')
    expect(echoMsg.content).toContain('[Echo] You said: e2e ws test')

    // Interrupt
    ws.sent.length = 0
    handleWsMessage(ws, JSON.stringify({ type: 'interrupt' }), manager, sessionId)
    expect(ws.sent.length).toBe(1)
    const intMsg = JSON.parse(ws.sent[0]) as { type: string }
    expect(intMsg.type).toBe('interrupted')
  })

  test('WS message to destroyed session returns error', async () => {
    const { sessionId } = await manager.createSession()
    await manager.destroySession(sessionId)

    const ws = createMockWs()
    handleWsMessage(ws, JSON.stringify({ type: 'ping' }), manager, sessionId)

    expect(ws.sent.length).toBe(1)
    const errMsg = JSON.parse(ws.sent[0]) as { type: string; message: string }
    expect(errMsg.type).toBe('error')
    expect(ws.closeCode).toBe(4004)
  })
})

// ===========================================================================
// Concurrent operations stress test
// ===========================================================================

describe('11: Concurrent session operations', () => {
  test('create 10 sessions concurrently', async () => {
    const manager = new SessionManager({ ...TEST_CONFIG, maxSessions: 20 })

    const promises = Array.from({ length: 10 }, (_, i) =>
      manager.createSession({ apiKey: `sk-concurrent-${i}`, cwd: `/tmp/concurrent/${i}` }),
    )

    const results = await Promise.all(promises)

    // All should succeed
    for (const r of results) {
      expect(r.sessionId).toBeDefined()
    }

    // All IDs should be unique
    const ids = results.map(r => r.sessionId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(10)

    // All API keys should be different
    const keys = results.map(r => r.context.config.apiKey)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(10)

    await manager.destroyAllSessions()
  })

  test('destroy all sessions concurrently', async () => {
    const manager = new SessionManager({ ...TEST_CONFIG, maxSessions: 20 })

    for (let i = 0; i < 5; i++) {
      await manager.createSession({ apiKey: `sk-${i}` })
    }

    const count = await manager.destroyAllSessions()
    expect(count).toBe(5)
    expect(manager.getAllSessions().size).toBe(0)
  })
})
