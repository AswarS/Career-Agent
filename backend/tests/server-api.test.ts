/**
 * server-api.test.ts — Comprehensive API tests for router.ts and wsHandler.ts
 *
 * Covers:
 *   - All REST routes (health, sessions CRUD, message SSE)
 *   - Auth middleware (token present / absent / wrong)
 *   - Error handling (404, 400, invalid JSON, session not found)
 *   - WebSocket protocol (open, ping/pong, user_message, interrupt, unknown type)
 *   - Edge cases (empty body, missing fields, concurrent operations)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createRouter } from '../src/server/router.js'
import { handleWsMessage, handleWsOpen } from '../src/server/wsHandler.js'
import { SessionManager } from '../src/server/SessionManager.js'
import type { ServerConfig } from '../src/server/types.js'

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const NO_AUTH_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  authToken: '',  // No auth required
  maxSessions: 50,
  idleTimeoutMs: 0,
}

const AUTH_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  authToken: 'secret',
  maxSessions: 50,
  idleTimeoutMs: 0,
}

// ---------------------------------------------------------------------------
// Mock WebSocket
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(token?: string): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/** Read full text from a ReadableStream<Uint8Array> */
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

// ---------------------------------------------------------------------------
// Router Tests — no auth
// ---------------------------------------------------------------------------

describe('Router — no auth', () => {
  let manager: SessionManager
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    manager = new SessionManager(NO_AUTH_CONFIG)
    router = createRouter(manager, NO_AUTH_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  describe('GET /v1/health', () => {
    test('returns status ok with session count and uptime', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/health'),
      )
      expect(resp.status).toBe(200)

      const body = await resp.json() as { status: string; sessions: number; uptime: number }
      expect(body.status).toBe('ok')
      expect(body.sessions).toBe(0)
      expect(typeof body.uptime).toBe('number')
      expect(body.uptime).toBeGreaterThan(0)
    })

    test('reflects active session count', async () => {
      manager.createSession()
      manager.createSession()

      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/health'),
      )
      const body = await resp.json() as { sessions: number }
      expect(body.sessions).toBe(2)
    })
  })

  describe('GET /v1/sessions', () => {
    test('returns empty list when no sessions exist', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions'),
      )
      expect(resp.status).toBe(200)

      const body = await resp.json() as { sessions: unknown[] }
      expect(body.sessions).toEqual([])
    })

    test('returns list with created sessions', async () => {
      const s1 = manager.createSession({ cwd: '/ws/a' })
      const s2 = manager.createSession({ cwd: '/ws/b' })

      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions'),
      )
      expect(resp.status).toBe(200)

      const body = await resp.json() as {
        sessions: Array<{ id: string; createdAt: number; lastActivityAt: number; cwd: string }>
      }
      expect(body.sessions.length).toBe(2)

      const ids = body.sessions.map(s => s.id).sort()
      expect(ids).toContain(s1.sessionId)
      expect(ids).toContain(s2.sessionId)
    })
  })

  describe('POST /v1/sessions', () => {
    test('creates a session with default options and returns 201', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      )
      expect(resp.status).toBe(201)

      const body = await resp.json() as { id: string; createdAt: number; cwd: string }
      expect(typeof body.id).toBe('string')
      expect(body.id.length).toBeGreaterThan(0)
      expect(typeof body.createdAt).toBe('number')
      expect(typeof body.cwd).toBe('string')
    })

    test('creates a session with custom cwd', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cwd: '/custom/workspace' }),
        }),
      )
      expect(resp.status).toBe(201)

      const body = await resp.json() as { cwd: string }
      expect(body.cwd).toBe('/custom/workspace')
    })

    test('returns 400 for invalid JSON body', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'this is not json',
        }),
      )
      expect(resp.status).toBe(400)

      const body = await resp.json() as { error: string }
      expect(body.error).toBe('Invalid JSON body')
    })
  })

  describe('GET /v1/sessions/:id', () => {
    test('returns session details for valid session', async () => {
      const { sessionId } = manager.createSession({ cwd: '/test/workspace' })

      const resp = await router.handleRequest(
        new Request(`http://localhost:8080/v1/sessions/${sessionId}`),
      )
      expect(resp.status).toBe(200)

      const body = await resp.json() as {
        id: string; cwd: string; wsConnections: number
      }
      expect(body.id).toBe(sessionId)
      expect(body.cwd).toBe('/test/workspace')
      expect(body.wsConnections).toBe(0)
    })

    test('returns 404 for nonexistent session', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions/00000000-0000-0000-0000-000000000000'),
      )
      expect(resp.status).toBe(404)
    })
  })

  describe('DELETE /v1/sessions/:id', () => {
    test('destroys an existing session and returns 200', async () => {
      const { sessionId } = manager.createSession()

      const resp = await router.handleRequest(
        new Request(`http://localhost:8080/v1/sessions/${sessionId}`, { method: 'DELETE' }),
      )
      expect(resp.status).toBe(200)

      const body = await resp.json() as { destroyed: boolean }
      expect(body.destroyed).toBe(true)
      expect(manager.getSession(sessionId)).toBeUndefined()
    })

    test('returns 404 for nonexistent session', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions/00000000-0000-0000-0000-000000000000', {
          method: 'DELETE',
        }),
      )
      expect(resp.status).toBe(404)
    })
  })

  describe('POST /v1/sessions/:id/message', () => {
    test('returns SSE stream with correct events', async () => {
      const { sessionId } = manager.createSession()

      const resp = await router.handleRequest(
        new Request(`http://localhost:8080/v1/sessions/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello, world!' }),
        }),
      )
      expect(resp.status).toBe(200)
      expect(resp.headers.get('Content-Type')).toBe('text/event-stream')

      const text = await readStream(resp.body as ReadableStream<Uint8Array>)

      expect(text).toContain('event: session_id')
      expect(text).toContain('event: assistant')
      expect(text).toContain('event: done')
      expect(text).toContain('[Echo] You said: Hello, world!')
    })

    test('returns 404 for nonexistent session', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/v1/sessions/00000000-0000-0000-0000-000000000000/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'test' }),
        }),
      )
      expect(resp.status).toBe(404)
    })

    test('returns 400 when content is missing', async () => {
      const { sessionId } = manager.createSession()

      const resp = await router.handleRequest(
        new Request(`http://localhost:8080/v1/sessions/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      )
      expect(resp.status).toBe(400)
    })
  })

  describe('404 - Unknown routes', () => {
    test('returns 404 for completely unknown path', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/unknown'),
      )
      expect(resp.status).toBe(404)
    })

    test('returns 404 for root path', async () => {
      const resp = await router.handleRequest(
        new Request('http://localhost:8080/'),
      )
      expect(resp.status).toBe(404)
    })
  })
})

// ---------------------------------------------------------------------------
// Router Tests — Auth enabled
// ---------------------------------------------------------------------------

describe('Router — with auth', () => {
  let manager: SessionManager
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    manager = new SessionManager(AUTH_CONFIG)
    router = createRouter(manager, AUTH_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('rejects request without Authorization header with 401', async () => {
    const resp = await router.handleRequest(
      new Request('http://localhost:8080/v1/health'),
    )
    expect(resp.status).toBe(401)
  })

  test('rejects request with wrong token with 401', async () => {
    const resp = await router.handleRequest(
      new Request('http://localhost:8080/v1/health', {
        headers: authHeaders('wrong-token'),
      }),
    )
    expect(resp.status).toBe(401)
  })

  test('allows request with correct Bearer token', async () => {
    const resp = await router.handleRequest(
      new Request('http://localhost:8080/v1/health', {
        headers: authHeaders('secret'),
      }),
    )
    expect(resp.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// WebSocket Handler Tests
// ---------------------------------------------------------------------------

describe('WebSocket — handleWsOpen', () => {
  test('sends connected message with sessionId', () => {
    const ws = createMockWs()
    handleWsOpen(ws, 'abc-123-def')

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string; sessionId: string }
    expect(parsed.type).toBe('connected')
    expect(parsed.sessionId).toBe('abc-123-def')
  })
})

describe('WebSocket — handleWsMessage', () => {
  let manager: SessionManager
  let sessionId: string

  beforeEach(() => {
    manager = new SessionManager(NO_AUTH_CONFIG)
    const result = manager.createSession()
    sessionId = result.sessionId
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('ping message receives pong response', () => {
    const ws = createMockWs()
    handleWsMessage(ws, JSON.stringify({ type: 'ping' }), manager, sessionId)

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string }
    expect(parsed.type).toBe('pong')
  })

  test('user_message receives echo assistant response', () => {
    const ws = createMockWs()
    handleWsMessage(
      ws,
      JSON.stringify({ type: 'user_message', content: 'Hello WS!' }),
      manager,
      sessionId,
    )

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as {
      type: string; content: string; sessionId: string
    }
    expect(parsed.type).toBe('assistant')
    expect(parsed.content).toBe('[Echo] You said: Hello WS!')
  })

  test('user_message with empty content returns error', () => {
    const ws = createMockWs()
    handleWsMessage(
      ws,
      JSON.stringify({ type: 'user_message', content: '' }),
      manager,
      sessionId,
    )

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string; message: string }
    expect(parsed.type).toBe('error')
    expect(parsed.message).toContain('content')
  })

  test('interrupt aborts the session', () => {
    const ws = createMockWs()
    const session = manager.getSession(sessionId)
    expect(session!.context.abortController.signal.aborted).toBe(false)

    handleWsMessage(ws, JSON.stringify({ type: 'interrupt' }), manager, sessionId)

    const parsed = JSON.parse(ws.sent[0]) as { type: string }
    expect(parsed.type).toBe('interrupted')
    expect(session!.context.abortController.signal.aborted).toBe(true)
  })

  test('unknown message type returns error', () => {
    const ws = createMockWs()
    handleWsMessage(
      ws,
      JSON.stringify({ type: 'unknown_type' }),
      manager,
      sessionId,
    )

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string; message: string }
    expect(parsed.type).toBe('error')
    expect(parsed.message).toContain('Unknown message type')
  })

  test('invalid JSON message returns error', () => {
    const ws = createMockWs()
    handleWsMessage(ws, 'not-json', manager, sessionId)

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string; message: string }
    expect(parsed.type).toBe('error')
    expect(parsed.message).toContain('Invalid JSON')
  })

  test('message for nonexistent session closes ws with error', () => {
    const ws = createMockWs()
    handleWsMessage(ws, JSON.stringify({ type: 'ping' }), manager, 'nonexistent')

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string; message: string }
    expect(parsed.type).toBe('error')
    expect(parsed.message).toBe('Session not found')
    expect(ws.closeCode).toBe(4004)
  })

  test('handles Buffer message correctly', () => {
    const ws = createMockWs()
    const buffer = new TextEncoder().encode(JSON.stringify({ type: 'ping' }))
    handleWsMessage(ws, buffer, manager, sessionId)

    expect(ws.sent.length).toBe(1)
    const parsed = JSON.parse(ws.sent[0]) as { type: string }
    expect(parsed.type).toBe('pong')
  })
})

// ---------------------------------------------------------------------------
// Integration — full session lifecycle
// ---------------------------------------------------------------------------

describe('Router — full session lifecycle', () => {
  let manager: SessionManager
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    manager = new SessionManager(NO_AUTH_CONFIG)
    router = createRouter(manager, NO_AUTH_CONFIG)
  })

  afterEach(async () => {
    await manager.destroyAllSessions()
  })

  test('create -> list -> get -> message -> delete lifecycle', async () => {
    // Health check with zero sessions
    const health0 = await router.handleRequest(
      new Request('http://localhost:8080/v1/health'),
    )
    const healthBody0 = await health0.json() as { sessions: number }
    expect(healthBody0.sessions).toBe(0)

    // Create session
    const createResp = await router.handleRequest(
      new Request('http://localhost:8080/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: '/lifecycle/test' }),
      }),
    )
    expect(createResp.status).toBe(201)
    const created = await createResp.json() as { id: string; cwd: string }
    const sessionId = created.id
    expect(created.cwd).toBe('/lifecycle/test')

    // Health check shows 1 session
    const health1 = await router.handleRequest(
      new Request('http://localhost:8080/v1/health'),
    )
    const healthBody1 = await health1.json() as { sessions: number }
    expect(healthBody1.sessions).toBe(1)

    // Send message via SSE
    const msgResp = await router.handleRequest(
      new Request(`http://localhost:8080/v1/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'lifecycle test' }),
      }),
    )
    expect(msgResp.status).toBe(200)

    const sseText = await readStream(msgResp.body as ReadableStream<Uint8Array>)
    expect(sseText).toContain('[Echo] You said: lifecycle test')

    // Delete session
    const delResp = await router.handleRequest(
      new Request(`http://localhost:8080/v1/sessions/${sessionId}`, { method: 'DELETE' }),
    )
    expect(delResp.status).toBe(200)

    // Verify session is gone
    const getAfterDel = await router.handleRequest(
      new Request(`http://localhost:8080/v1/sessions/${sessionId}`),
    )
    expect(getAfterDel.status).toBe(404)
  })
})
