import { useCallback, useRef, useReducer, useState, createContext, useContext } from 'react'
import type {
  AppAction, AppState, SessionInfo, ChatMessage,
  SessionListItem, CreateSessionRequest, AssistantData, UserData,
  ResultData, SystemEventData, SystemMessageData, StateChangeData, ProgressData,
} from '../types'
import { api } from '../api/client'
import { sendMessageSSE } from '../api/sse'

// ---------- reducer ----------

const initialState: AppState = {
  sessions: new Map(),
  activeSessionId: null,
  error: null,
}

function updateSession(state: AppState, id: string, fn: (s: SessionInfo) => SessionInfo): AppState {
  const s = state.sessions.get(id)
  if (!s) return state
  return { ...state, sessions: new Map(state.sessions).set(id, fn(s)) }
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SESSIONS': {
      const m = new Map(state.sessions)
      for (const s of action.sessions) {
        if (!m.has(s.id)) {
          m.set(s.id, { ...s, state: 'idle', messages: [], isStreaming: false })
        } else {
          const old = m.get(s.id)!
          m.set(s.id, { ...old, lastActivityAt: s.lastActivityAt })
        }
      }
      return { ...state, sessions: m }
    }
    case 'ADD_SESSION':
      return {
        ...state,
        sessions: new Map(state.sessions).set(action.session.id, action.session),
        activeSessionId: action.session.id,
      }
    case 'REMOVE_SESSION': {
      const m = new Map(state.sessions)
      m.delete(action.id)
      return {
        ...state,
        sessions: m,
        activeSessionId: state.activeSessionId === action.id
          ? (m.keys().next().value ?? null)
          : state.activeSessionId,
      }
    }
    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.id }
    case 'SET_SESSION_STATE':
      return updateSession(state, action.id, s => ({ ...s, state: action.state }))
    case 'SET_SESSION_STREAMING':
      return updateSession(state, action.id, s => ({ ...s, isStreaming: action.value }))
    case 'ADD_MESSAGE':
      return updateSession(state, action.sessionId, s => ({
        ...s, messages: [...s.messages, action.message],
      }))
    case 'UPDATE_MESSAGE':
      return updateSession(state, action.sessionId, s => ({
        ...s,
        messages: s.messages.map(m =>
          m.id === action.messageId ? { ...m, ...action.updates } : m
        ),
      }))
    case 'SET_ERROR':
      return { ...state, error: action.error }
    case 'SET_SESSION_MESSAGES':
      return updateSession(state, action.sessionId, s => ({
        ...s, messages: action.messages,
      }))
    default:
      return state
  }
}

// ---------- context ----------

interface AppContextValue {
  state: AppState
  activeSession: SessionInfo | null
  currentUserId: string
  setCurrentUserId: (id: string) => void
  dispatch: React.Dispatch<AppAction>
  refreshSessions: () => Promise<void>
  createSession: (opts: CreateSessionRequest) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendMessage: (content: string) => void
  abortSession: (sessionId: string) => void
  setActiveSession: (id: string | null) => void
}

const AppContext = createContext<AppContextValue>(null!)

export function useApp() { return useContext(AppContext) }

export { AppContext }

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Per-session abort controllers
  const abortControllers = useRef(new Map<string, AbortController>())
  // Synchronous streaming guard — prevents double-send before React re-render
  const streamingRef = useRef(new Map<string, boolean>())
  // Current user identity — persisted in localStorage
  const [currentUserId, setCurrentUserIdState] = useState<string>(
    () => localStorage.getItem('claude_user_id') || ''
  )

  const setCurrentUserId = useCallback((id: string) => {
    localStorage.setItem('claude_user_id', id)
    setCurrentUserIdState(id)
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      // Always fetch ALL sessions so sidebar can group by user.
      // Previously filtered by currentUserId which caused other users'
      // sessions to disappear after switching or refreshing.
      const res = await api.listSessions()
      dispatch({ type: 'SET_SESSIONS', sessions: res.sessions })
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message })
    }
  }, [])

  const createSession = useCallback(async (opts: CreateSessionRequest) => {
    try {
      const res = await api.createSession({ ...opts, permissions: { mode: 'allow_all' } })
      dispatch({
        type: 'ADD_SESSION',
        session: {
          id: res.id, cwd: res.cwd, createdAt: res.createdAt,
          lastActivityAt: res.createdAt, state: 'idle', messages: [],
          isStreaming: false, userId: opts.userId || undefined,
        },
      })
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message })
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    try {
      // Abort any in-flight SSE for this session
      const controller = abortControllers.current.get(id)
      if (controller) {
        controller.abort()
        abortControllers.current.delete(id)
      }
      await api.deleteSession(id)
      dispatch({ type: 'REMOVE_SESSION', id })
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message })
    }
  }, [])

  const sendMessage = useCallback((content: string) => {
    const sid = state.activeSessionId
    if (!sid) return
    // Check per-session streaming state via synchronous ref — the React
    // state (session.isStreaming) can be stale between dispatches, allowing
    // a rapid double-send to slip through.
    if (streamingRef.current.get(sid)) return
    const session = state.sessions.get(sid)
    if (!session) return
    streamingRef.current.set(sid, true)

    // optimistically add user message
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`, role: 'user', timestamp: Date.now(), content,
    }
    dispatch({ type: 'ADD_MESSAGE', sessionId: sid, message: userMsg })
    dispatch({ type: 'SET_SESSION_STATE', id: sid, state: 'running' })
    dispatch({ type: 'SET_SESSION_STREAMING', id: sid, value: true })

    const controller = new AbortController()
    abortControllers.current.set(sid, controller)
    // track current assistant message uuid for streaming updates
    let currentAssistantId: string | null = null

    sendMessageSSE(
      sid,
      content,
      (event, data) => {
        switch (event) {
          case 'system': {
            const d = data as SystemEventData
            if (d.subtype === 'init') {
              dispatch({
                type: 'ADD_MESSAGE', sessionId: sid,
                message: {
                  id: d.uuid, role: 'system', timestamp: Date.now(),
                  level: 'info', message: `Model: ${(d as any).model} | Tools: ${(d as any).tools?.length ?? 0}`,
                  model: (d as any).model,
                },
              })
            } else {
              const sd = data as any
              const level = sd.level ?? (sd.subtype === 'api_retry' || sd.error ? 'warning' : 'info')
              let message = sd.message ?? ''
              if (sd.subtype === 'api_retry') {
                message = `API rate limited, retrying (${sd.attempt}/${sd.max_retries})...`
              }
              if (!message && sd.error) {
                message = String(sd.error)
              }
              if (!message) {
                // Skip system events with no meaningful message
                break
              }
              dispatch({
                type: 'ADD_MESSAGE', sessionId: sid,
                message: {
                  id: d.uuid, role: 'system', timestamp: Date.now(),
                  level, message,
                },
              })
            }
            break
          }
          case 'assistant': {
            const d = data as AssistantData
            const msgId = d.uuid
            if (currentAssistantId === msgId) {
              dispatch({
                type: 'UPDATE_MESSAGE', sessionId: sid, messageId: msgId,
                updates: { blocks: [...d.message.content] },
              })
            } else {
              currentAssistantId = msgId
              dispatch({
                type: 'ADD_MESSAGE', sessionId: sid,
                message: {
                  id: msgId, role: 'assistant', timestamp: Date.now(),
                  blocks: [...d.message.content], model: d.message.model,
                },
              })
            }
            break
          }
          case 'user': {
            const d = data as UserData
            currentAssistantId = null
            const toolContent = typeof d.message.content === 'string'
              ? d.message.content
              : (d.message.content as any[]).map(c => c.content).join('\n')
            dispatch({
              type: 'ADD_MESSAGE', sessionId: sid,
              message: {
                id: d.uuid, role: 'system', timestamp: Date.now(),
                level: 'info', message: `[Tool Result] ${toolContent?.slice(0, 200)}`,
              },
            })
            break
          }
          case 'result': {
            const d = data as ResultData
            currentAssistantId = null
            dispatch({
              type: 'ADD_MESSAGE', sessionId: sid,
              message: { id: d.uuid, role: 'result', timestamp: Date.now(), result: d },
            })
            break
          }
          case 'error': {
            const d = data as any
            dispatch({
              type: 'ADD_MESSAGE', sessionId: sid,
              message: {
                id: `err-${Date.now()}`, role: 'system', timestamp: Date.now(),
                level: 'error', message: d.message,
              },
            })
            break
          }
          case 'state_change': {
            const d = data as StateChangeData
            dispatch({ type: 'SET_SESSION_STATE', id: sid, state: d.state })
            break
          }
          case 'progress': {
            break
          }
        }
      },
      (err) => {
        streamingRef.current.delete(sid)
        dispatch({ type: 'SET_ERROR', error: err.message })
        dispatch({ type: 'SET_SESSION_STATE', id: sid, state: 'idle' })
        dispatch({ type: 'SET_SESSION_STREAMING', id: sid, value: false })
        abortControllers.current.delete(sid)
      },
      () => {
        streamingRef.current.delete(sid)
        dispatch({ type: 'SET_SESSION_STATE', id: sid, state: 'idle' })
        dispatch({ type: 'SET_SESSION_STREAMING', id: sid, value: false })
        abortControllers.current.delete(sid)
      },
      controller.signal,
    )
  }, [state.activeSessionId, state.sessions])

  const abortSession = useCallback((sessionId: string) => {
    const controller = abortControllers.current.get(sessionId)
    if (controller) {
      controller.abort()
      abortControllers.current.delete(sessionId)
      streamingRef.current.delete(sessionId)
      dispatch({ type: 'SET_SESSION_STATE', id: sessionId, state: 'idle' })
      dispatch({ type: 'SET_SESSION_STREAMING', id: sessionId, value: false })
    }
  }, [])

  // Track which sessions have already loaded history to avoid duplicate fetches
  const loadedHistory = useRef(new Set<string>())

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    const session = state.sessions.get(sessionId)
    // Skip if already loaded or session doesn't exist
    if (!session || session.messages.length > 0 || loadedHistory.current.has(sessionId)) return
    loadedHistory.current.add(sessionId)
    try {
      const res = await api.getSessionMessages(sessionId)
      if (res.messages && res.messages.length > 0) {
        // Convert transcript messages to ChatMessage format
        const chatMessages: ChatMessage[] = res.messages.map((msg: any, i: number) => ({
          id: msg.id || `hist-${sessionId}-${i}`,
          role: msg.role || 'assistant',
          timestamp: msg.timestamp || Date.now(),
          content: typeof msg.content === 'string' ? msg.content : undefined,
          blocks: Array.isArray(msg.content) ? msg.content : undefined,
        }))
        dispatch({ type: 'SET_SESSION_MESSAGES', sessionId, messages: chatMessages })
      }
    } catch {
      // Silently fail — session may not have a transcript file yet
    }
  }, [state.sessions])

  const setActiveSession = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE', id })
    if (id) loadSessionMessages(id)
  }, [loadSessionMessages])

  const activeSession = state.activeSessionId ? state.sessions.get(state.activeSessionId) ?? null : null

  return (
    <AppContext.Provider value={{
      state, activeSession, currentUserId, setCurrentUserId, dispatch,
      refreshSessions, createSession, deleteSession, sendMessage, abortSession,
      setActiveSession,
    }}>
      {children}
    </AppContext.Provider>
  )
}
