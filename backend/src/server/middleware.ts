/**
 * middleware.ts — Production hardening middleware for multi-user server
 *
 * Provides:
 *   - CORS handling with configurable origins and OPTIONS preflight
 *   - Per-IP rate limiting (sliding window)
 *   - Request body size limits
 *   - Request-level tracing with correlation IDs
 *   - Structured request logging
 */

import { randomUUID } from 'node:crypto'
import type { ServerConfig } from './types.js'

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Build CORS response headers based on the request Origin and config.
 * Returns headers to merge into the response.
 */
export function corsHeaders(req: Request, config: ServerConfig): Record<string, string> {
  const origins = config.corsOrigins ?? ['*']
  const origin = req.headers.get('Origin') ?? '*'

  const allowedOrigin = origins.includes('*') ? '*' : (origins.includes(origin) ? origin : origins[0])

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

/**
 * Handle CORS preflight (OPTIONS) request.
 * Returns a 204 response with appropriate CORS headers.
 */
export function handleCorsPreflightRequest(req: Request, config: ServerConfig): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req, config),
  })
}

// ---------------------------------------------------------------------------
// Rate limiting (per-IP sliding window)
// ---------------------------------------------------------------------------

type RateLimitEntry = {
  timestamps: number[]
}

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Check if the request should be rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(ip: string, config: ServerConfig): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const limit = config.rateLimitPerMinute ?? 0
  if (limit <= 0) return { allowed: true } // No rate limiting

  const now = Date.now()
  const windowMs = 60_000 // 1 minute window

  let entry = rateLimitStore.get(ip)
  if (!entry) {
    entry = { timestamps: [] }
    rateLimitStore.set(ip, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfterMs = oldestInWindow + windowMs - now
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) }
  }

  entry.timestamps.push(now)
  return { allowed: true }
}

/**
 * Get the client IP from the request.
 * Handles proxy headers (X-Forwarded-For) and falls back to connection info.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('X-Forwarded-For')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  // Bun doesn't expose IP directly on Request; use a fallback
  return 'unknown'
}

/**
 * Periodically clean up expired rate limit entries.
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now()
  const windowMs = 60_000

  for (const [ip, entry] of rateLimitStore) {
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(ip)
    }
  }
}

// ---------------------------------------------------------------------------
// Request body size limit
// ---------------------------------------------------------------------------

/**
 * Check if the request body exceeds the configured maximum size.
 * Uses Content-Length header for pre-flight check.
 */
export function checkBodySize(req: Request, config: ServerConfig): { ok: true } | { ok: false; maxSize: number } {
  const maxSize = config.maxRequestBodyBytes ?? 1_000_000
  const contentLength = req.headers.get('Content-Length')

  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (!Number.isNaN(size) && size > maxSize) {
      return { ok: false, maxSize }
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Request tracing
// ---------------------------------------------------------------------------

/**
 * Generate a correlation ID for request tracing.
 */
export function generateRequestId(): string {
  return randomUUID().slice(0, 8) // Short ID for log readability
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

export type RequestLogEntry = {
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
  ip: string
  sessionId?: string
  error?: string
}

/**
 * Log a completed request in structured format.
 */
export function logRequest(entry: RequestLogEntry): void {
  const msg = `[${entry.requestId}] ${entry.method} ${entry.path} → ${entry.status} (${entry.durationMs}ms)${entry.sessionId ? ` session=${entry.sessionId}` : ''}${entry.error ? ` error=${entry.error}` : ''}`
  if (entry.status >= 500) {
    console.error(msg)
  } else if (entry.status >= 400) {
    console.warn(msg)
  } else {
    console.log(msg)
  }
}

// ---------------------------------------------------------------------------
// Combined middleware
// ---------------------------------------------------------------------------

export type MiddlewareResult =
  | { type: 'continue'; requestId: string; startTime: number }
  | { type: 'response'; response: Response }

/**
 * Run all pre-request middleware checks.
 * Returns either 'continue' (proceed to route handler) or a Response to send immediately.
 */
export function runMiddleware(req: Request, config: ServerConfig): MiddlewareResult {
  const requestId = generateRequestId()
  const startTime = Date.now()

  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return {
      type: 'response',
      response: handleCorsPreflightRequest(req, config),
    }
  }

  // 2. Rate limiting
  const ip = getClientIp(req)
  const rateLimitResult = checkRateLimit(ip, config)
  if (!rateLimitResult.allowed) {
    return {
      type: 'response',
      response: new Response(
        JSON.stringify({ error: 'Rate limit exceeded', retryAfterMs: rateLimitResult.retryAfterMs }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)),
            ...corsHeaders(req, config),
          },
        },
      ),
    }
  }

  // 3. Body size check
  const bodyCheck = checkBodySize(req, config)
  if (!bodyCheck.ok) {
    return {
      type: 'response',
      response: new Response(
        JSON.stringify({ error: `Request body too large. Max: ${bodyCheck.maxSize} bytes` }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req, config) },
        },
      ),
    }
  }

  return { type: 'continue', requestId, startTime }
}

/**
 * Create a wrapped response with CORS headers and request logging.
 */
export function finalizeResponse(
  req: Request,
  response: Response,
  config: ServerConfig,
  requestId: string,
  startTime: number,
): Response {
  const durationMs = Date.now() - startTime

  // Merge CORS headers into the response
  const existingHeaders = Object.fromEntries(response.headers.entries())
  const newHeaders = { ...corsHeaders(req, config), ...existingHeaders }

  // Log the request
  logRequest({
    requestId,
    method: req.method,
    path: new URL(req.url).pathname,
    status: response.status,
    durationMs,
    ip: getClientIp(req),
  })

  // Return new Response with merged headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}
