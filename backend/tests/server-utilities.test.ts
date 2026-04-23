/**
 * server-utilities.test.ts — Tests for config, permissions, filesystemIsolation, cleanup
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { resolve } from 'node:path'
import { parseServerConfig, DEFAULT_SERVER_CONFIG } from '../src/server/config.js'
import { checkToolPermission, type PermissionConfig } from '../src/server/permissions.js'
import { validatePath, isPathWithinWorkspace, validatePaths } from '../src/server/filesystemIsolation.js'
import { closeWebSocket, closeAllWebSockets, abortSession, cleanupSessionResources, cleanupWithTimeout } from '../src/server/cleanup.js'

/** Join path segments with the platform separator for test assertions */
function joinSep(...segments: string[]): string {
  return segments.join('/')
}

// ---------------------------------------------------------------------------
// config.ts
// ---------------------------------------------------------------------------
describe('parseServerConfig', () => {
  beforeEach(() => {
    delete process.env.CLAUDE_SERVER_PORT
    delete process.env.CLAUDE_SERVER_HOST
    delete process.env.CLAUDE_SERVER_AUTH_TOKEN
    delete process.env.CLAUDE_SERVER_TIMEOUT_MS
    delete process.env.CLAUDE_SERVER_MAX_SESSIONS
    delete process.env.CLAUDE_SERVER_WORKSPACE
  })

  test('returns defaults when no overrides', () => {
    const config = parseServerConfig()
    expect(config.port).toBe(DEFAULT_SERVER_CONFIG.port)
    expect(config.host).toBe(DEFAULT_SERVER_CONFIG.host)
    expect(config.authToken).toBe('')
    expect(config.maxSessions).toBe(DEFAULT_SERVER_CONFIG.maxSessions)
  })

  test('CLI flags override defaults', () => {
    const config = parseServerConfig({ port: 9090, authToken: 'secret' })
    expect(config.port).toBe(9090)
    expect(config.authToken).toBe('secret')
  })

  test('env vars override defaults when no CLI flags', () => {
    process.env.CLAUDE_SERVER_PORT = '3000'
    process.env.CLAUDE_SERVER_HOST = '127.0.0.1'
    process.env.CLAUDE_SERVER_AUTH_TOKEN = 'env-token'
    const config = parseServerConfig()
    expect(config.port).toBe(3000)
    expect(config.host).toBe('127.0.0.1')
    expect(config.authToken).toBe('env-token')
  })

  test('CLI flags take precedence over env vars', () => {
    process.env.CLAUDE_SERVER_PORT = '3000'
    const config = parseServerConfig({ port: 9090 })
    expect(config.port).toBe(9090)
  })

  test('throws on invalid port', () => {
    expect(() => parseServerConfig({ port: 0 })).toThrow('Invalid port')
    expect(() => parseServerConfig({ port: 99999 })).toThrow('Invalid port')
  })

  test('throws on invalid maxSessions', () => {
    expect(() => parseServerConfig({ maxSessions: 0 })).toThrow('Invalid maxSessions')
    expect(() => parseServerConfig({ maxSessions: -1 })).toThrow('Invalid maxSessions')
  })

  test('invalid env port falls back to default', () => {
    process.env.CLAUDE_SERVER_PORT = 'not-a-number'
    const config = parseServerConfig()
    expect(config.port).toBe(DEFAULT_SERVER_CONFIG.port)
  })
})

// ---------------------------------------------------------------------------
// permissions.ts
// ---------------------------------------------------------------------------
describe('checkToolPermission', () => {
  test('allow_all permits everything', () => {
    const config: PermissionConfig = { mode: 'allow_all' }
    expect(checkToolPermission('Bash', config).allowed).toBe(true)
    expect(checkToolPermission('Read', config).allowed).toBe(true)
    expect(checkToolPermission('Write', config).allowed).toBe(true)
  })

  test('deny_dangerous blocks dangerous tools', () => {
    const config: PermissionConfig = { mode: 'deny_dangerous' }
    expect(checkToolPermission('Bash', config).allowed).toBe(false)
    expect(checkToolPermission('Write', config).allowed).toBe(false)
    expect(checkToolPermission('Read', config).allowed).toBe(true)
  })

  test('allow_read_only only allows read tools', () => {
    const config: PermissionConfig = { mode: 'allow_read_only' }
    expect(checkToolPermission('Read', config).allowed).toBe(true)
    expect(checkToolPermission('Grep', config).allowed).toBe(true)
    expect(checkToolPermission('Bash', config).allowed).toBe(false)
    expect(checkToolPermission('Write', config).allowed).toBe(false)
  })

  test('explicit denies everything (V2)', () => {
    const config: PermissionConfig = { mode: 'explicit' }
    expect(checkToolPermission('Read', config).allowed).toBe(false)
  })

  test('deniedTools always wins', () => {
    const config: PermissionConfig = { mode: 'allow_all', deniedTools: ['Read'] }
    expect(checkToolPermission('Read', config).allowed).toBe(false)
  })

  test('allowedTools always wins', () => {
    const config: PermissionConfig = { mode: 'allow_read_only', allowedTools: ['Bash'] }
    expect(checkToolPermission('Bash', config).allowed).toBe(true)
  })

  test('deniedTools takes precedence over allowedTools', () => {
    const config: PermissionConfig = { mode: 'allow_all', deniedTools: ['Bash'], allowedTools: ['Bash'] }
    expect(checkToolPermission('Bash', config).allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filesystemIsolation.ts
// ---------------------------------------------------------------------------
describe('filesystemIsolation', () => {
  test('allows paths within workspace', () => {
    const root = resolve('/workspace/userA')
    const result = validatePath('file.txt', root)
    expect(result.endsWith('file.txt')).toBe(true)
    expect(isPathWithinWorkspace('file.txt', root)).toBe(true)
  })

  test('rejects path traversal attacks', () => {
    const root = resolve('/workspace/userA')
    expect(() => validatePath('../../../etc/passwd', root)).toThrow('Path traversal detected')
    expect(() => validatePath('/workspace/userB/secret', root)).toThrow('Path traversal detected')
  })

  test('isPathWithinWorkspace returns boolean', () => {
    const root = resolve('/workspace/userA')
    expect(isPathWithinWorkspace('file.txt', root)).toBe(true)
    expect(isPathWithinWorkspace('../../etc/passwd', root)).toBe(false)
  })

  test('validatePaths validates multiple paths', () => {
    const root = resolve('/workspace/userA')
    const results = validatePaths(['a.txt', 'b/c.txt'], root)
    expect(results.length).toBe(2)
    expect(results[0].endsWith('a.txt')).toBe(true)
    // On Windows, path separator is \, so just check it contains the path parts
    expect(results[1].includes('b')).toBe(true)
    expect(results[1].endsWith('c.txt')).toBe(true)
  })

  test('validatePaths throws on first violation', () => {
    const root = resolve('/workspace/userA')
    expect(() => validatePaths(['safe.txt', '../../etc/passwd', 'also-safe.txt'], root)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// cleanup.ts
// ---------------------------------------------------------------------------
describe('cleanup utilities', () => {
  test('closeWebSocket calls ws.close', () => {
    let closeArgs: any[] = []
    const ws = { close: (...args: any[]) => { closeArgs = args } }
    closeWebSocket(ws, 'test_reason')
    expect(closeArgs).toEqual([1000, 'test_reason'])
  })

  test('closeWebSocket handles null/undefined', () => {
    expect(() => closeWebSocket(null)).not.toThrow()
    expect(() => closeWebSocket(undefined)).not.toThrow()
  })

  test('closeAllWebSockets clears the set', () => {
    const ws1 = { close: () => {} }
    const ws2 = { close: () => {} }
    const connections = new Set([ws1, ws2])
    closeAllWebSockets(connections, 'done')
    expect(connections.size).toBe(0)
  })

  test('abortSession aborts the controller', () => {
    const ac = new AbortController()
    expect(ac.signal.aborted).toBe(false)
    abortSession(ac)
    expect(ac.signal.aborted).toBe(true)
  })

  test('abortSession is idempotent', () => {
    const ac = new AbortController()
    abortSession(ac)
    abortSession(ac)
    expect(ac.signal.aborted).toBe(true)
  })

  test('cleanupSessionResources cleans up everything', async () => {
    let ws1Closed = false
    let ws2Closed = false
    let mcpClosed = false
    const ws1 = { close: () => { ws1Closed = true } }
    const ws2 = { close: () => { ws2Closed = true } }
    const connections = new Set([ws1, ws2])
    const mcpClients = [{ close: async () => { mcpClosed = true } }]
    const ac = new AbortController()

    await cleanupSessionResources({ wsConnections: connections, mcpClients, abortController: ac })

    expect(ac.signal.aborted).toBe(true)
    expect(connections.size).toBe(0)
    expect(ws1Closed).toBe(true)
    expect(ws2Closed).toBe(true)
    expect(mcpClosed).toBe(true)
  })
})
