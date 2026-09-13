import { appendFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

type JsonRecord = Record<string, unknown>

export interface GatewayMonitorContext {
  requestId: string
  sessionId?: string
  userId?: string
  gatewayUrl: string
  startedAt: number
}

export interface GatewayRequestBreakdown {
  estimatedTokens: number
  systemTokens: number
  toolDefinitionTokens: number
  userMessageTokens: number
  assistantMessageTokens: number
  assistantToolCallTokens: number
  toolResultTokens: number
  otherTokens: number
  wrapperOverheadTokens: number
  messageCount: number
  toolDefinitionCount: number
  toolDefinitions: Array<{ name: string; estimatedTokens: number }>
  messages: Array<{
    index: number
    role: string
    kind: string
    toolName?: string
    estimatedTokens: number
  }>
  shapeHash: string
}

const queues = new Map<string, Promise<void>>()

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function monitoringEnabled(): boolean {
  return /^(?:1|true|yes|on)$/i.test(
    process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED?.trim() ?? '',
  )
}

function monitorDir(): string {
  return resolve(
    process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR?.trim() ||
      join(process.cwd(), 'data', 'gateway-monitor'),
  )
}

function safeUserId(userId: string | undefined): string {
  return userId?.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'unknown'
}

function logPath(userId: string | undefined): string {
  const date = new Date().toISOString().slice(0, 10)
  return join(monitorDir(), `gateway-usage-${safeUserId(userId)}-${date}.jsonl`)
}

async function appendEvent(userId: string | undefined, event: JsonRecord): Promise<void> {
  if (!monitoringEnabled()) return
  const path = logPath(userId)
  const previous = queues.get(path) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(monitorDir(), { recursive: true })
      await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8')
    })
  queues.set(path, next)
  try {
    await next
  } catch (error) {
    // Observability must never become part of the gateway request's failure path.
    console.warn(
      '[GatewayTokenMonitor] unable to append usage event:',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    if (queues.get(path) === next) queues.delete(path)
  }
}

/** Fast cross-model estimate used for attribution, never presented as billing usage. */
export function estimateGatewayTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  if (!text) return 0
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length
  return Math.max(1, Math.ceil(cjk + (text.length - cjk) / 4))
}

function functionName(tool: JsonRecord): string {
  const fn = isRecord(tool.function) ? tool.function : null
  return typeof fn?.name === 'string' && fn.name ? fn.name : 'unknown_tool'
}

export function analyzeGatewayRequest(request: JsonRecord): GatewayRequestBreakdown {
  let systemTokens = 0
  let userMessageTokens = 0
  let assistantMessageTokens = 0
  let assistantToolCallTokens = 0
  let toolResultTokens = 0
  let otherTokens = 0
  const messages: GatewayRequestBreakdown['messages'] = []
  const toolNameByCallId = new Map<string, string>()

  for (const [index, value] of (Array.isArray(request.messages) ? request.messages : []).entries()) {
    if (!isRecord(value)) continue
    const role = typeof value.role === 'string' ? value.role : 'unknown'
    const contentTokens = estimateGatewayTokens(value.content ?? '')
    const callTokens = Array.isArray(value.tool_calls)
      ? estimateGatewayTokens(value.tool_calls)
      : 0
    if (Array.isArray(value.tool_calls)) {
      for (const rawCall of value.tool_calls) {
        if (!isRecord(rawCall)) continue
        const id = typeof rawCall.id === 'string' ? rawCall.id : ''
        if (id) toolNameByCallId.set(id, functionName(rawCall))
      }
    }

    let kind = 'other'
    let toolName: string | undefined
    if (role === 'system') {
      kind = 'system'
      systemTokens += contentTokens
    } else if (role === 'user') {
      kind = 'user_message'
      userMessageTokens += contentTokens
    } else if (role === 'assistant') {
      kind = callTokens ? 'assistant_with_tool_calls' : 'assistant_message'
      assistantMessageTokens += contentTokens
      assistantToolCallTokens += callTokens
    } else if (role === 'tool') {
      kind = 'tool_result'
      const callId = typeof value.tool_call_id === 'string' ? value.tool_call_id : ''
      toolName = toolNameByCallId.get(callId)
      toolResultTokens += contentTokens
    } else {
      otherTokens += contentTokens + callTokens
    }
    messages.push({
      index,
      role,
      kind,
      ...(toolName ? { toolName } : {}),
      estimatedTokens: contentTokens + callTokens,
    })
  }

  const toolDefinitions = (Array.isArray(request.tools) ? request.tools : [])
    .filter(isRecord)
    .map((tool) => ({
      name: functionName(tool),
      estimatedTokens: estimateGatewayTokens(tool),
    }))
    .sort((left, right) => right.estimatedTokens - left.estimatedTokens)
  const toolDefinitionTokens = toolDefinitions.reduce(
    (total, tool) => total + tool.estimatedTokens,
    0,
  )
  const attributedTokens = systemTokens + toolDefinitionTokens +
    userMessageTokens + assistantMessageTokens + assistantToolCallTokens +
    toolResultTokens + otherTokens
  const estimatedTokens = estimateGatewayTokens(request)
  const wrapperOverheadTokens = Math.max(0, estimatedTokens - attributedTokens)
  const shapeHash = createHash('sha256')
    .update(JSON.stringify({
      model: request.model,
      roles: messages.map((message) => message.role),
      tools: toolDefinitions.map((tool) => tool.name),
    }))
    .digest('hex')
    .slice(0, 16)

  return {
    estimatedTokens,
    systemTokens,
    toolDefinitionTokens,
    userMessageTokens,
    assistantMessageTokens,
    assistantToolCallTokens,
    toolResultTokens,
    otherTokens,
    wrapperOverheadTokens,
    messageCount: messages.length,
    toolDefinitionCount: toolDefinitions.length,
    toolDefinitions: toolDefinitions.slice(0, 30),
    messages: [...messages]
      .sort((left, right) => right.estimatedTokens - left.estimatedTokens)
      .slice(0, 30),
    shapeHash,
  }
}

function gatewayHost(gatewayUrl: string): string {
  try {
    return new URL(gatewayUrl).host
  } catch {
    return 'invalid-url'
  }
}

export async function recordGatewayRequest(
  context: GatewayMonitorContext,
  request: JsonRecord,
): Promise<void> {
  if (!monitoringEnabled()) return
  await appendEvent(context.userId, {
    schema_version: '1.0',
    event: 'gateway.request',
    timestamp: new Date(context.startedAt).toISOString(),
    request_id: context.requestId,
    session_id: context.sessionId ?? null,
    user_id: context.userId ?? null,
    gateway_host: gatewayHost(context.gatewayUrl),
    model: typeof request.model === 'string' ? request.model : null,
    stream: request.stream === true,
    max_tokens: typeof request.max_tokens === 'number' ? request.max_tokens : null,
    breakdown: analyzeGatewayRequest(request),
  })
}

function responseUsage(value: unknown): JsonRecord | null {
  const usage = isRecord(value) ? value : null
  if (!usage) return null
  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : null
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : null
  return {
    prompt_tokens: Number(usage.prompt_tokens ?? 0),
    completion_tokens: Number(usage.completion_tokens ?? 0),
    total_tokens: Number(
      usage.total_tokens ??
      (Number(usage.prompt_tokens ?? 0) + Number(usage.completion_tokens ?? 0)),
    ),
    cached_tokens: Number(promptDetails?.cached_tokens ?? 0),
    reasoning_tokens: Number(completionDetails?.reasoning_tokens ?? 0),
  }
}

export async function recordGatewayResponse(
  context: GatewayMonitorContext,
  input: {
    status: number | null
    usage?: unknown
    outcome: 'completed' | 'http_error' | 'network_error' | 'cancelled' | 'invalid_response'
    error?: unknown
  },
): Promise<void> {
  if (!monitoringEnabled()) return
  await appendEvent(context.userId, {
    schema_version: '1.0',
    event: 'gateway.response',
    timestamp: new Date().toISOString(),
    request_id: context.requestId,
    session_id: context.sessionId ?? null,
    user_id: context.userId ?? null,
    gateway_host: gatewayHost(context.gatewayUrl),
    status: input.status,
    outcome: input.outcome,
    duration_ms: Date.now() - context.startedAt,
    usage: responseUsage(input.usage),
    error_name: input.error instanceof Error ? input.error.name : null,
  })
}
