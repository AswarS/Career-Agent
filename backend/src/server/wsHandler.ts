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
 * V1: Echo response. V2 will integrate with QueryEngine.
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

  // Run within the session's ALS context
  runWithSessionContext(context, () => {
    // V1: Echo
    sendWs(ws, {
      type: 'assistant',
      content: `[Echo] You said: ${content}`,
      sessionId: context.sessionId,
    })
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
