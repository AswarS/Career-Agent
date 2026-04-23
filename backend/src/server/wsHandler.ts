/**
 * wsHandler.ts — WebSocket protocol handler for real-time session interaction
 *
 * Protocol (V1):
 *   Client → Server:
 *     { type: "ping" }                              — Keep-alive
 *     { type: "user_message", content: string }     — Send a message
 *     { type: "interrupt" }                         — Cancel current operation
 *
 *   Server → Client:
 *     { type: "connected", sessionId: string }      — Connection confirmed
 *     { type: "pong" }                              — Keep-alive response
 *     { type: "assistant", content: string }        — Assistant response chunk
 *     { type: "error", message: string }            — Error notification
 *     { type: "session_destroyed" }                 — Session was destroyed
 */

import type { SessionManager } from './SessionManager.js'
import { runWithSessionContext } from './SessionContext.js'

export interface WsMessage {
  type: string
  [key: string]: unknown
}

/**
 * Handle an incoming WebSocket message.
 * Parses the message, validates the type, and dispatches to the appropriate handler.
 */
export function handleWsMessage(
  ws: any,
  rawMessage: string | Buffer | ArrayBuffer,
  sessionManager: SessionManager,
  sessionId: string,
): void {
  const session = sessionManager.getSession(sessionId)
  if (!session) {
    sendWsError(ws, 'Session not found')
    ws.close?.(4004, 'Session not found')
    return
  }

  sessionManager.touchSession(sessionId)

  let message: WsMessage
  try {
    const text = typeof rawMessage === 'string'
      ? rawMessage
      : new TextDecoder().decode(rawMessage)
    message = JSON.parse(text)
  } catch {
    sendWsError(ws, 'Invalid JSON message')
    return
  }

  switch (message.type) {
    case 'ping':
      sendWs(ws, { type: 'pong' })
      break

    case 'user_message':
      handleUserMessage(ws, message, sessionManager, session.context)
      break

    case 'interrupt':
      handleInterrupt(ws, session.context)
      break

    default:
      sendWsError(ws, `Unknown message type: ${message.type}`)
  }
}

/**
 * Send a connection confirmation when WebSocket opens.
 */
export function handleWsOpen(ws: any, sessionId: string): void {
  sendWs(ws, { type: 'connected', sessionId })
}

/**
 * Handle a user_message from WebSocket.
 * Routes to QueryEngine for real LLM conversations, falls back to echo if
 * QueryEngine is not available.
 */
function handleUserMessage(
  ws: any,
  message: WsMessage,
  sessionManager: SessionManager,
  context: any,
): void {
  const content = message.content
  if (typeof content !== 'string' || content.length === 0) {
    sendWsError(ws, 'Missing or empty "content" field')
    return
  }

  // Use QueryEngine if available, otherwise echo
  if (context.queryEngine) {
    // Fire-and-forget async — errors are sent over the WebSocket
    handleQueryEngineMessage(ws, content, context).catch((err: any) => {
      sendWsError(ws, err.message ?? String(err))
    })
  } else {
    // Echo mode fallback — no QueryEngine available
    runWithSessionContext(context, () => {
      sendWs(ws, {
        type: 'assistant',
        content: `[Echo] You said: ${content}`,
        sessionId: context.sessionId,
      })
    })
  }
}

/**
 * Stream a user message through the QueryEngine and send events over WebSocket.
 * The entire async iteration runs inside the session's ALS context so that
 * any code calling getSessionContext() (e.g. getAnthropicClient, getState)
 * resolves to the correct per-session state.
 */
async function handleQueryEngineMessage(
  ws: any,
  content: string,
  context: any,
): Promise<void> {
  await runWithSessionContext(context, async () => {
    try {
      for await (const msg of context.queryEngine.submitMessage(content)) {
        // Check if WebSocket is still open before sending
        if (ws.readyState !== 1 /* OPEN */) break

        sendWs(ws, {
          type: msg.type,
          ...msg,
          sessionId: context.sessionId,
        })
      }
      sendWs(ws, { type: 'done', sessionId: context.sessionId })
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        sendWs(ws, {
          type: 'error',
          message: err.message ?? String(err),
          sessionId: context.sessionId,
        })
      }
    }
  })
}

/**
 * Handle an interrupt request.
 */
function handleInterrupt(ws: any, context: any): void {
  if (!context.abortController.signal.aborted) {
    context.abortController.abort()
  }
  sendWs(ws, { type: 'interrupted' })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendWs(ws: any, data: unknown): void {
  try {
    if (ws && typeof ws.send === 'function') {
      ws.send(JSON.stringify(data))
    }
  } catch {
    // Socket may be closing
  }
}

function sendWsError(ws: any, message: string): void {
  sendWs(ws, { type: 'error', message })
}
