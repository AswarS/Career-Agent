// ============================================================
// 基础枚举 / 字面量联合类型
// ============================================================

export type SessionState = 'idle' | 'running' | 'requires_action'
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | null
export type ResultSubtype = 'success' | 'error_max_turns' | 'error_max_budget_usd' | 'error_during_execution'
export type SystemLevel = 'info' | 'warning' | 'error'

// ============================================================
// Content Block 类型
// ============================================================

export interface TextBlock { type: 'text'; text: string }
export interface ThinkingBlock { type: 'thinking'; thinking: string; signature: string }
export interface ToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export interface ToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }

export type AssistantContentBlock = TextBlock | ThinkingBlock | ToolUseBlock

// ============================================================
// SSE 事件数据结构
// ============================================================

export interface SessionIdData { sessionId: string }

export interface SystemInitData {
  type: 'system'; subtype: 'init'
  cwd: string; session_id: string; tools: string[]; mcp_servers: unknown[]
  model: string; permissionMode: string; slash_commands: string[]
  apiKeySource: string; claude_code_version: string; output_style: string
  agents: unknown[]; skills: string[]; plugins: unknown[]
  uuid: string; fast_mode_state: string; sessionId: string
}

export interface SystemMessageData {
  type: 'system'; subtype: string; level?: SystemLevel; message?: string
  uuid: string; sessionId: string
}

export type SystemEventData = SystemInitData | SystemMessageData

export interface AssistantData {
  type: 'assistant'
  message: {
    id: string; type: 'message'; role: 'assistant'; model: string
    content: AssistantContentBlock[]; stop_reason: StopReason
    stop_sequence: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
  parent_tool_use_id: string | null
  session_id: string; uuid: string; sessionId: string
}

export interface UserData {
  type: 'user'
  message: { role: 'user'; content: string | ToolResultBlock[] }
  parent_tool_use_id: string | null
  session_id: string; uuid: string; timestamp?: string
  tool_use_result?: string; sessionId: string
}

export interface ResultData {
  type: 'result'; subtype: ResultSubtype; is_error: boolean
  duration_ms: number; duration_api_ms: number; num_turns: number
  result: string; stop_reason: StopReason; session_id: string
  total_cost_usd: number
  usage: {
    input_tokens: number; cache_creation_input_tokens: number
    cache_read_input_tokens: number; output_tokens: number
    server_tool_use: { web_search_requests: number; web_fetch_requests: number }
  }
  modelUsage: Record<string, {
    inputTokens: number; outputTokens: number
    cacheReadInputTokens: number; cacheCreationInputTokens: number
    costUSD: number; contextWindow: number; maxOutputTokens: number
  }>
  permission_denials: unknown[]; fast_mode_state: string
  uuid: string; sessionId: string
}

export interface ErrorData { type: 'error'; message: string; sessionId: string }
export interface DoneData { sessionId: string }

export interface ProgressData {
  type: 'progress'; tool_use_id: string; tool_name: string
  progress: { kind: string; [key: string]: unknown }; sessionId: string
}

export interface StateChangeData {
  type: 'state_change'; state: SessionState; previous_state: SessionState; sessionId: string
}

export type SSEEventData =
  | SessionIdData | SystemEventData | AssistantData | UserData
  | ResultData | ErrorData | DoneData | ProgressData | StateChangeData

// ============================================================
// 会话管理 API 类型
// ============================================================

export interface CreateSessionRequest {
  apiKey?: string; baseUrl?: string; userId?: string; cwd?: string
  model?: string
  permissions?: { mode: string }
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
  resumeFrom?: string
}

export interface CreateSessionResponse { id: string; createdAt: number; cwd: string }
export interface SessionListItem { id: string; createdAt: number; lastActivityAt: number; cwd: string; userId?: string }
export interface SessionListResponse { sessions: SessionListItem[] }
export interface SessionDetailResponse { id: string; createdAt: number; lastActivityAt: number; cwd: string; wsConnections: number }

// ============================================================
// 前端内部 UI 类型
// ============================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'result'
  timestamp: number
  content?: string
  blocks?: AssistantContentBlock[]
  result?: ResultData
  level?: SystemLevel
  message?: string
  model?: string
}

export interface SessionInfo {
  id: string
  cwd: string
  createdAt: number
  lastActivityAt: number
  state: SessionState
  messages: ChatMessage[]
  isStreaming: boolean
  userId?: string
}

export type AppAction =
  | { type: 'SET_SESSIONS'; sessions: SessionListItem[] }
  | { type: 'ADD_SESSION'; session: SessionInfo }
  | { type: 'REMOVE_SESSION'; id: string }
  | { type: 'SET_ACTIVE'; id: string | null }
  | { type: 'SET_SESSION_STATE'; id: string; state: SessionState }
  | { type: 'SET_SESSION_STREAMING'; id: string; value: boolean }
  | { type: 'ADD_MESSAGE'; sessionId: string; message: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; sessionId: string; messageId: string; updates: Partial<ChatMessage> }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_SESSION_MESSAGES'; sessionId: string; messages: ChatMessage[] }

export interface AppState {
  sessions: Map<string, SessionInfo>
  activeSessionId: string | null
  error: string | null
}
