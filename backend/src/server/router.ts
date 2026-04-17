/**
 * router.ts — REST API router for multi-user server mode
 *
 * Endpoints:
 *   GET  /v1/health            — Health check
 *   GET  /v1/sessions          — List all sessions
 *   POST /v1/sessions          — Create new session
 *   GET  /v1/sessions/:id      — Get session info
 *   DELETE /v1/sessions/:id    — Destroy session
 *   POST /v1/sessions/:id/message — Send message (SSE streaming)
 */

import type { SessionManager } from './SessionManager.js'
import type { ServerConfig } from './types.js'
import { runWithSessionContext } from './SessionContext.js'

type RouteMethod = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'

type Route = {
  method: RouteMethod
  pattern: RegExp
  handler: (params: Record<string, string>, req: Request, config: ServerConfig) => Promise<Response>
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status)
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function checkAuth(req: Request, config: ServerConfig): Response | null {
  if (!config.authToken) return null // No auth required
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('Unauthorized', 401)
  const match = authHeader.match(/^Bearer\s+(.+)$/)
  if (!match || match[1] !== config.authToken) return errorResponse('Unauthorized', 401)
  return null
}

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function healthRoute(manager: SessionManager): Route {
  return {
    method: 'GET',
    pattern: /^\/v1\/health$/,
    handler: async () => {
      return json({
        status: 'ok',
        sessions: manager.getAllSessions().size,
        uptime: process.uptime(),
      })
    },
  }
}

function listSessionsRoute(): Route {
  return {
    method: 'GET',
    pattern: /^\/v1\/sessions$/,
    handler: async (_params, _req, _config, manager?: SessionManager) => {
      if (!manager) return errorResponse('Internal error', 500)
      const sessions = Array.from(manager.getAllSessions().entries()).map(
        ([id, session]) => ({
          id,
          createdAt: session.context.createdAt,
          lastActivityAt: session.lastActivityAt,
          cwd: session.context.config.cwd,
          ...(session.context.config.model ? { model: session.context.config.model } : {}),
        }),
      )
      return json({ sessions })
    },
  }
}

function createSessionRoute(): Route {
  return {
    method: 'POST',
    pattern: /^\/v1\/sessions$/,
    handler: async (_params, req, _config, manager?: SessionManager) => {
      if (!manager) return errorResponse('Internal error', 500)

      let body: Record<string, unknown>
      try {
        const text = await req.text()
        if (!text) return errorResponse('Invalid JSON body', 400)
        body = JSON.parse(text)
      } catch {
        return errorResponse('Invalid JSON body', 400)
      }

      try {
        const { sessionId, context } = manager.createSession({
          apiKey: body.apiKey as string | undefined,
          baseUrl: body.baseUrl as string | undefined,
          provider: body.provider as string | undefined,
          model: body.model as string | undefined,
          cwd: body.cwd as string | undefined,
          permissions: body.permissions as any | undefined,
        })

        return json(
          {
            id: sessionId,
            createdAt: context.createdAt,
            cwd: context.config.cwd,
            ...(context.config.model ? { model: context.config.model } : {}),
          },
          201,
        )
      } catch (err: any) {
        if (err.message?.includes('Maximum sessions')) {
          return errorResponse(err.message, 429)
        }
        return errorResponse(err.message ?? 'Internal error', 500)
      }
    },
  }
}

function getSessionRoute(): Route {
  return {
    method: 'GET',
    pattern: /^\/v1\/sessions\/([^/]+)$/,
    handler: async (params, _req, _config, manager?: SessionManager) => {
      if (!manager) return errorResponse('Internal error', 500)
      const sessionId = params['0']
      const session = manager.getSession(sessionId)
      if (!session) return errorResponse('Session not found', 404)

      return json({
        id: sessionId,
        createdAt: session.context.createdAt,
        lastActivityAt: session.lastActivityAt,
        cwd: session.context.config.cwd,
        wsConnections: session.context.wsConnections.size,
        ...(session.context.config.model ? { model: session.context.config.model } : {}),
      })
    },
  }
}

function deleteSessionRoute(): Route {
  return {
    method: 'DELETE',
    pattern: /^\/v1\/sessions\/([^/]+)$/,
    handler: async (params, _req, _config, manager?: SessionManager) => {
      if (!manager) return errorResponse('Internal error', 500)
      const sessionId = params['0']
      const destroyed = await manager.destroySession(sessionId)
      if (!destroyed) return errorResponse('Session not found', 404)
      return json({ destroyed: true })
    },
  }
}

function messageRoute(): Route {
  return {
    method: 'POST',
    pattern: /^\/v1\/sessions\/([^/]+)\/message$/,
    handler: async (params, req, _config, manager?: SessionManager) => {
      if (!manager) return errorResponse('Internal error', 500)
      const sessionId = params['0']
      const session = manager.getSession(sessionId)
      if (!session) return errorResponse('Session not found', 404)

      let body: Record<string, unknown>
      try {
        const text = await req.text()
        if (!text) return errorResponse('Invalid JSON body', 400)
        body = JSON.parse(text)
      } catch {
        return errorResponse('Invalid JSON body', 400)
      }

      const content = body.content
      if (typeof content !== 'string' || content.length === 0) {
        return errorResponse('"content" must be a non-empty string', 400)
      }

      manager.touchSession(sessionId)

      // SSE stream
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()

          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(sseEvent(event, data)))
          }

          runWithSessionContext(session.context, () => {
            // V1: Echo response. V2 will integrate with QueryEngine.
            send('session_id', { sessionId })
            send('assistant', {
              content: `[Echo] You said: ${content}`,
              sessionId,
            })
            send('done', { sessionId })
          })

          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createRouter(manager: SessionManager, config: ServerConfig) {
  const routes: Route[] = [
    healthRoute(manager),
    listSessionsRoute(),
    createSessionRoute(),
    getSessionRoute(),
    deleteSessionRoute(),
    messageRoute(),
  ]

  async function handleRequest(req: Request): Promise<Response> {
    // Auth check
    const authError = checkAuth(req, config)
    if (authError) return authError

    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method.toUpperCase() as RouteMethod

    for (const route of routes) {
      if (route.method !== method) continue
      const match = path.match(route.pattern)
      if (!match) continue

      const params: Record<string, string> = {}
      if (match.length > 1) {
        // Numbered capture groups
        for (let i = 1; i < match.length; i++) {
          params[String(i - 1)] = match[i]
        }
      }

      return route.handler(params, req, config, manager)
    }

    return errorResponse('Not found', 404)
  }

  return { handleRequest }
}
