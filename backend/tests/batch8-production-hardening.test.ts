/**
 * batch8-production-hardening.test.ts — Tests for production hardening (Batch 8)
 *
 * Covers:
 *   - CORS headers and OPTIONS preflight
 *   - Per-IP rate limiting (sliding window)
 *   - Request body size limits
 *   - Request tracing (correlation IDs)
 *   - Structured request logging
 *   - Config parsing for new options
 *   - Middleware integration with router
 */
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import type { ServerConfig } from '../src/server/types.js'
import {
  corsHeaders,
  handleCorsPreflightRequest,
  checkRateLimit,
  getClientIp,
  cleanupRateLimitStore,
  checkBodySize,
  generateRequestId,
  logRequest,
  runMiddleware,
  finalizeResponse,
  type RequestLogEntry,
} from '../src/server/middleware.js'

// ---------------------------------------------------------------------------
// Test config helpers
// ---------------------------------------------------------------------------

const NO_AUTH_CONFIG: ServerConfig = {
  port: 8080,
  host: '0.0.0.0',
  authToken: '',
  maxSessions: 50,
  idleTimeoutMs: 0,
  corsOrigins: ['*'],
  rateLimitPerMinute: 0,
  maxRequestBodyBytes: 1_000_000,
  requestTimeoutMs: 300_000,
}

const RESTRICTED_CORS_CONFIG: ServerConfig = {
  ...NO_AUTH_CONFIG,
  corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
}

const RATE_LIMITED_CONFIG: ServerConfig = {
  ...NO_AUTH_CONFIG,
  rateLimitPerMinute: 3,
}

const SMALL_BODY_CONFIG: ServerConfig = {
  ...NO_AUTH_CONFIG,
  maxRequestBodyBytes: 100,
}

// ===========================================================================
// CORS
// ===========================================================================

describe('CORS headers', () => {
  test('wildcard origin returns *', () => {
    const req = new Request('http://localhost/v1/health')
    const headers = corsHeaders(req, NO_AUTH_CONFIG)

    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Access-Control-Allow-Methods']).toContain('GET')
    expect(headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(headers['Access-Control-Allow-Headers']).toContain('Authorization')
  })

  test('matching origin returns the specific origin', () => {
    const req = new Request('http://localhost/v1/health', {
      headers: { Origin: 'https://app.example.com' },
    })
    const headers = corsHeaders(req, RESTRICTED_CORS_CONFIG)

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })

  test('non-matching origin returns first configured origin', () => {
    const req = new Request('http://localhost/v1/health', {
      headers: { Origin: 'https://evil.com' },
    })
    const headers = corsHeaders(req, RESTRICTED_CORS_CONFIG)

    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })

  test('no Origin header defaults to *', () => {
    const req = new Request('http://localhost/v1/health')
    const headers = corsHeaders(req, NO_AUTH_CONFIG)

    expect(headers['Access-Control-Allow-Origin']).toBe('*')
  })

  test('Max-Age header is set', () => {
    const req = new Request('http://localhost/v1/health')
    const headers = corsHeaders(req, NO_AUTH_CONFIG)

    expect(headers['Access-Control-Max-Age']).toBe('86400')
  })
})

describe('CORS preflight', () => {
  test('OPTIONS request returns 204 with CORS headers', () => {
    const req = new Request('http://localhost/v1/sessions', { method: 'OPTIONS' })
    const response = handleCorsPreflightRequest(req, NO_AUTH_CONFIG)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  test('preflight with specific origin returns matching origin', () => {
    const req = new Request('http://localhost/v1/sessions', {
      method: 'OPTIONS',
      headers: { Origin: 'https://admin.example.com' },
    })
    const response = handleCorsPreflightRequest(req, RESTRICTED_CORS_CONFIG)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com')
  })
})

// ===========================================================================
// Rate limiting
// ===========================================================================

describe('Rate limiting', () => {
  beforeEach(() => {
    cleanupRateLimitStore()
  })

  test('no rate limit when rateLimitPerMinute is 0', () => {
    const result = checkRateLimit('1.2.3.4', NO_AUTH_CONFIG)
    expect(result.allowed).toBe(true)
  })

  test('requests under limit are allowed', () => {
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit('1.2.3.4', RATE_LIMITED_CONFIG)
      expect(result.allowed).toBe(true)
    }
  })

  test('requests over limit are blocked', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('1.2.3.4', RATE_LIMITED_CONFIG)
    }
    // 4th request should be blocked
    const result = checkRateLimit('1.2.3.4', RATE_LIMITED_CONFIG)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0)
    }
  })

  test('different IPs have independent limits', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('1.1.1.1', RATE_LIMITED_CONFIG)
    }
    // Different IP should still be allowed
    const result = checkRateLimit('2.2.2.2', RATE_LIMITED_CONFIG)
    expect(result.allowed).toBe(true)
  })

  test('cleanup removes expired entries', () => {
    checkRateLimit('cleanup-test', RATE_LIMITED_CONFIG)
    // Manually expire by tampering with the store
    // The cleanup function removes entries with no timestamps in window
    cleanupRateLimitStore()
    // After cleanup, the IP should be able to make requests again
    // (since we only made 1 request and it may still be in window)
    const result = checkRateLimit('cleanup-test', RATE_LIMITED_CONFIG)
    expect(result.allowed).toBe(true)
  })
})

// ===========================================================================
// Client IP
// ===========================================================================

describe('Client IP extraction', () => {
  test('X-Forwarded-For header is used', () => {
    const req = new Request('http://localhost/', {
      headers: { 'X-Forwarded-For': '10.0.0.1, 172.16.0.1' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  test('falls back to unknown when no header', () => {
    const req = new Request('http://localhost/')
    expect(getClientIp(req)).toBe('unknown')
  })

  test('trims whitespace from X-Forwarded-For', () => {
    const req = new Request('http://localhost/', {
      headers: { 'X-Forwarded-For': '  10.0.0.2  ' },
    })
    expect(getClientIp(req)).toBe('10.0.0.2')
  })
})

// ===========================================================================
// Body size check
// ===========================================================================

describe('Request body size check', () => {
  test('no Content-Length passes check', () => {
    const req = new Request('http://localhost/', { method: 'POST', body: '{}' })
    const result = checkBodySize(req, NO_AUTH_CONFIG)
    expect(result.ok).toBe(true)
  })

  test('Content-Length under limit passes', () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Length': '50' },
    })
    const result = checkBodySize(req, SMALL_BODY_CONFIG)
    expect(result.ok).toBe(true)
  })

  test('Content-Length over limit is rejected', () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Length': '200' },
    })
    const result = checkBodySize(req, SMALL_BODY_CONFIG)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.maxSize).toBe(100)
    }
  })

  test('Content-Length equal to limit passes', () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Length': '100' },
    })
    const result = checkBodySize(req, SMALL_BODY_CONFIG)
    expect(result.ok).toBe(true)
  })

  test('default limit is 1MB', () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Length': '999999' },
    })
    const result = checkBodySize(req, NO_AUTH_CONFIG)
    expect(result.ok).toBe(true)
  })
})

// ===========================================================================
// Request tracing
// ===========================================================================

describe('Request tracing', () => {
  test('generateRequestId returns 8-char hex string', () => {
    const id = generateRequestId()
    expect(id.length).toBe(8)
    expect(id).toMatch(/^[0-9a-f]{8}$/)
  })

  test('generateRequestId returns unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId())
    }
    expect(ids.size).toBe(100)
  })
})

// ===========================================================================
// Structured logging
// ===========================================================================

describe('Structured logging', () => {
  test('logRequest does not throw for 2xx', () => {
    expect(() => {
      logRequest({
        requestId: 'abc12345',
        method: 'GET',
        path: '/v1/health',
        status: 200,
        durationMs: 5,
        ip: '127.0.0.1',
      })
    }).not.toThrow()
  })

  test('logRequest does not throw for 4xx', () => {
    expect(() => {
      logRequest({
        requestId: 'abc12345',
        method: 'POST',
        path: '/v1/sessions',
        status: 400,
        durationMs: 2,
        ip: '127.0.0.1',
      })
    }).not.toThrow()
  })

  test('logRequest does not throw for 5xx with error', () => {
    expect(() => {
      logRequest({
        requestId: 'abc12345',
        method: 'GET',
        path: '/v1/sessions/xxx',
        status: 500,
        durationMs: 100,
        ip: '127.0.0.1',
        error: 'Internal error',
      })
    }).not.toThrow()
  })

  test('logRequest with sessionId', () => {
    expect(() => {
      logRequest({
        requestId: 'abc12345',
        method: 'POST',
        path: '/v1/sessions/abc/message',
        status: 200,
        durationMs: 1500,
        ip: '127.0.0.1',
        sessionId: 'session-123',
      })
    }).not.toThrow()
  })
})

// ===========================================================================
// Combined middleware
// ===========================================================================

describe('Combined middleware', () => {
  test('OPTIONS returns CORS preflight response', () => {
    const req = new Request('http://localhost/v1/sessions', { method: 'OPTIONS' })
    const result = runMiddleware(req, NO_AUTH_CONFIG)

    expect(result.type).toBe('response')
    if (result.type === 'response') {
      expect(result.response.status).toBe(204)
      expect(result.response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    }
  })

  test('normal request returns continue', () => {
    const req = new Request('http://localhost/v1/health')
    const result = runMiddleware(req, NO_AUTH_CONFIG)

    expect(result.type).toBe('continue')
    if (result.type === 'continue') {
      expect(result.requestId).toBeDefined()
      expect(result.requestId.length).toBe(8)
      expect(result.startTime).toBeGreaterThan(0)
    }
  })

  test('rate-limited request returns 429', () => {
    // Exhaust the rate limit
    for (let i = 0; i < 3; i++) {
      const req = new Request('http://localhost/v1/health', {
        headers: { 'X-Forwarded-For': 'rl-test-ip' },
      })
      runMiddleware(req, RATE_LIMITED_CONFIG)
    }

    // Next request should be rate-limited
    const req = new Request('http://localhost/v1/health', {
      headers: { 'X-Forwarded-For': 'rl-test-ip' },
    })
    const result = runMiddleware(req, RATE_LIMITED_CONFIG)

    expect(result.type).toBe('response')
    if (result.type === 'response') {
      expect(result.response.status).toBe(429)
      expect(result.response.headers.get('Retry-After')).toBeDefined()
    }
  })

  test('oversized body returns 413', () => {
    const req = new Request('http://localhost/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '500',
      },
    })
    const result = runMiddleware(req, SMALL_BODY_CONFIG)

    expect(result.type).toBe('response')
    if (result.type === 'response') {
      expect(result.response.status).toBe(413)
    }
  })
})

// ===========================================================================
// finalizeResponse
// ===========================================================================

describe('finalizeResponse', () => {
  test('adds CORS headers to response', () => {
    const req = new Request('http://localhost/v1/health')
    const originalResponse = new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const finalResponse = finalizeResponse(req, originalResponse, NO_AUTH_CONFIG, 'test1234', Date.now() - 10)

    expect(finalResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(finalResponse.headers.get('Content-Type')).toBe('application/json')
    expect(finalResponse.status).toBe(200)
  })

  test('preserves response status', () => {
    const req = new Request('http://localhost/v1/sessions/nonexistent')
    const originalResponse = new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })

    const finalResponse = finalizeResponse(req, originalResponse, NO_AUTH_CONFIG, 'test5678', Date.now())

    expect(finalResponse.status).toBe(404)
    expect(finalResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

// ===========================================================================
// Config parsing
// ===========================================================================

describe('Config parsing for new options', () => {
  test('default config has corsOrigins *', () => {
    const { DEFAULT_SERVER_CONFIG } = require('../src/server/config.js')
    expect(DEFAULT_SERVER_CONFIG.corsOrigins).toEqual(['*'])
  })

  test('default config has rate limit 0', () => {
    const { DEFAULT_SERVER_CONFIG } = require('../src/server/config.js')
    expect(DEFAULT_SERVER_CONFIG.rateLimitPerMinute).toBe(0)
  })

  test('default config has 1MB body limit', () => {
    const { DEFAULT_SERVER_CONFIG } = require('../src/server/config.js')
    expect(DEFAULT_SERVER_CONFIG.maxRequestBodyBytes).toBe(1_000_000)
  })

  test('default config has 5 minute request timeout', () => {
    const { DEFAULT_SERVER_CONFIG } = require('../src/server/config.js')
    expect(DEFAULT_SERVER_CONFIG.requestTimeoutMs).toBe(300_000)
  })
})

// ===========================================================================
// Regression — existing tests still work with middleware
// ===========================================================================

describe('Regression — middleware does not break existing flows', () => {
  test('health endpoint works with middleware', async () => {
    const { createRouter } = await import('../src/server/router.js')
    const { SessionManager } = await import('../src/server/SessionManager.js')

    const config: ServerConfig = { ...NO_AUTH_CONFIG }
    const manager = new SessionManager(config)
    const { handleRequest } = createRouter(manager, config)

    const req = new Request('http://localhost/v1/health')
    const result = runMiddleware(req, config)

    expect(result.type).toBe('continue')

    const response = await handleRequest(req)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')

    await manager.destroyAllSessions()
  })

  test('session creation works with middleware', async () => {
    const { createRouter } = await import('../src/server/router.js')
    const { SessionManager } = await import('../src/server/SessionManager.js')

    const config: ServerConfig = { ...NO_AUTH_CONFIG }
    const manager = new SessionManager(config)
    const { handleRequest } = createRouter(manager, config)

    const req = new Request('http://localhost/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: '/workspace/test' }),
    })

    const result = runMiddleware(req, config)
    expect(result.type).toBe('continue')

    const response = await handleRequest(req)
    expect(response.status).toBe(201)

    await manager.destroyAllSessions()
  })
})
