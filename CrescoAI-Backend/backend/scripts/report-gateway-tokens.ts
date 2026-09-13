import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

type JsonRecord = Record<string, any>

interface Options {
  userId?: string
  sessionId?: string
  requestId?: string
  top: number
  monitorDir: string
  jsonPath?: string
}

const COMPONENTS = [
  ['system', 'systemTokens'],
  ['tool_definitions', 'toolDefinitionTokens'],
  ['user_messages', 'userMessageTokens'],
  ['assistant_history', 'assistantMessageTokens'],
  ['assistant_tool_calls', 'assistantToolCallTokens'],
  ['tool_results', 'toolResultTokens'],
  ['other', 'otherTokens'],
  ['wrapper_overhead', 'wrapperOverheadTokens'],
] as const

function parseArgs(argv: string[]): Options {
  let userId: string | undefined
  let sessionId: string | undefined
  let requestId: string | undefined
  let top = 20
  let monitorDir = resolve('data', 'gateway-monitor')
  let jsonPath: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if (arg === '--user-id' && value) {
      userId = value
      index += 1
    } else if (arg === '--session-id' && value) {
      sessionId = value
      index += 1
    } else if (arg === '--request-id' && value) {
      requestId = value
      index += 1
    } else if (arg === '--top' && value) {
      top = Number(value)
      index += 1
    } else if (arg === '--monitor-dir' && value) {
      monitorDir = resolve(value)
      index += 1
    } else if (arg === '--json' && value) {
      jsonPath = resolve(value)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun run gateway:tokens [--user-id 1] [--session-id ID] [--request-id ID] [--top 20] [--monitor-dir PATH] [--json PATH]')
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }
  if (!Number.isSafeInteger(top) || top < 1 || top > 500) {
    throw new Error('--top must be an integer from 1 to 500')
  }
  return { userId, sessionId, requestId, top, monitorDir, jsonPath }
}

async function readEvents(options: Options): Promise<JsonRecord[]> {
  const entries = await readdir(options.monitorDir, { withFileTypes: true }).catch((error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('gateway-usage-') && entry.name.endsWith('.jsonl'))
    .filter((entry) => !options.userId || entry.name.startsWith(`gateway-usage-${options.userId}-`))
    .map((entry) => join(options.monitorDir, entry.name))
    .sort()
  const events: JsonRecord[] = []
  for (const path of files) {
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line))
      } catch (error) {
        throw new Error(`Invalid gateway monitor JSONL at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return events
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function shortId(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 8) : '-'
}

async function report(options: Options) {
  const events = await readEvents(options)
  if (!events.length) {
    throw new Error(
      `No gateway monitor records found in ${options.monitorDir}. Send a model request after enabling CAREER_AGENT_GATEWAY_MONITOR_ENABLED=true.`,
    )
  }
  const requests = new Map<string, JsonRecord>()
  const responses = new Map<string, JsonRecord>()
  for (const event of events) {
    if (typeof event.request_id !== 'string') continue
    if (options.sessionId && event.session_id !== options.sessionId) continue
    if (options.requestId && event.request_id !== options.requestId) continue
    if (event.event === 'gateway.request') requests.set(event.request_id, event)
    if (event.event === 'gateway.response') responses.set(event.request_id, event)
  }

  const componentTotals = new Map<string, number>()
  const toolSchemaTotals = new Map<string, number>()
  const rows = [...requests.values()].map((request) => {
    const response = responses.get(request.request_id)
    const breakdown = request.breakdown ?? {}
    const reportedPrompt = numberValue(response?.usage?.prompt_tokens)
    const reportedCompletion = numberValue(response?.usage?.completion_tokens)
    const estimatedPrompt = numberValue(breakdown.estimatedTokens)
    const calibration = reportedPrompt > 0 && estimatedPrompt > 0
      ? reportedPrompt / estimatedPrompt
      : 1
    const components = COMPONENTS.map(([name, key]) => ({
      name,
      estimated_tokens: numberValue(breakdown[key]),
      calibrated_prompt_tokens: Math.round(numberValue(breakdown[key]) * calibration),
    })).sort((left, right) => right.calibrated_prompt_tokens - left.calibrated_prompt_tokens)
    for (const component of components) {
      componentTotals.set(
        component.name,
        (componentTotals.get(component.name) ?? 0) + component.calibrated_prompt_tokens,
      )
    }
    for (const tool of Array.isArray(breakdown.toolDefinitions) ? breakdown.toolDefinitions : []) {
      if (typeof tool?.name !== 'string') continue
      toolSchemaTotals.set(
        tool.name,
        (toolSchemaTotals.get(tool.name) ?? 0) + Math.round(numberValue(tool.estimatedTokens) * calibration),
      )
    }
    return {
      request_id: request.request_id,
      session_id: request.session_id,
      timestamp: request.timestamp,
      model: request.model,
      gateway_host: request.gateway_host,
      outcome: response?.outcome ?? 'pending',
      status: response?.status ?? null,
      duration_ms: numberValue(response?.duration_ms),
      reported_prompt_tokens: reportedPrompt,
      reported_completion_tokens: reportedCompletion,
      reported_total_tokens: numberValue(response?.usage?.total_tokens) || reportedPrompt + reportedCompletion,
      cached_tokens: numberValue(response?.usage?.cached_tokens),
      reasoning_tokens: numberValue(response?.usage?.reasoning_tokens),
      estimated_prompt_tokens: estimatedPrompt,
      estimate_to_reported_ratio: reportedPrompt > 0 ? Number((estimatedPrompt / reportedPrompt).toFixed(4)) : null,
      dominant_cause: components[0]?.name ?? 'unknown',
      components,
      message_count: numberValue(breakdown.messageCount),
      tool_definition_count: numberValue(breakdown.toolDefinitionCount),
      largest_messages: breakdown.messages ?? [],
      largest_tool_definitions: breakdown.toolDefinitions ?? [],
    }
  }).sort((left, right) => {
    const leftTokens = left.reported_total_tokens || left.estimated_prompt_tokens
    const rightTokens = right.reported_total_tokens || right.estimated_prompt_tokens
    return rightTokens - leftTokens
  })

  const aggregateComponents = [...componentTotals.entries()]
    .map(([name, calibrated_prompt_tokens]) => ({ name, calibrated_prompt_tokens }))
    .sort((left, right) => right.calibrated_prompt_tokens - left.calibrated_prompt_tokens)
  const aggregateTools = [...toolSchemaTotals.entries()]
    .map(([name, calibrated_schema_tokens]) => ({ name, calibrated_schema_tokens }))
    .sort((left, right) => right.calibrated_schema_tokens - left.calibrated_schema_tokens)
  const totals = rows.reduce((result, row) => ({
    requests: result.requests + 1,
    prompt_tokens: result.prompt_tokens + row.reported_prompt_tokens,
    completion_tokens: result.completion_tokens + row.reported_completion_tokens,
    total_tokens: result.total_tokens + row.reported_total_tokens,
    estimated_prompt_tokens: result.estimated_prompt_tokens + row.estimated_prompt_tokens,
  }), { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_prompt_tokens: 0 })
  const output = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    filters: {
      user_id: options.userId ?? null,
      session_id: options.sessionId ?? null,
      request_id: options.requestId ?? null,
    },
    totals,
    aggregate_components: aggregateComponents,
    aggregate_tool_schemas: aggregateTools,
    requests: rows,
  }

  console.log(`Gateway requests: ${totals.requests}`)
  console.log(`Reported tokens: prompt=${formatNumber(totals.prompt_tokens)} completion=${formatNumber(totals.completion_tokens)} total=${formatNumber(totals.total_tokens)}`)
  console.log('\nCore causes (calibrated against reported prompt tokens)')
  aggregateComponents.forEach((component, index) => {
    console.log(`${index + 1}. ${component.name}: ~${formatNumber(component.calibrated_prompt_tokens)}`)
  })
  console.log('\nWorst requests')
  rows.slice(0, options.top).forEach((row, index) => {
    console.log(`${index + 1}. ${shortId(row.request_id)} session=${shortId(row.session_id)} total=${formatNumber(row.reported_total_tokens || row.estimated_prompt_tokens)} cause=${row.dominant_cause} tools=${row.tool_definition_count} messages=${row.message_count} outcome=${row.outcome}`)
  })
  console.log('\nLargest repeated tool schemas')
  aggregateTools.slice(0, options.top).forEach((tool, index) => {
    console.log(`${index + 1}. ${tool.name}: ~${formatNumber(tool.calibrated_schema_tokens)}`)
  })

  if (options.jsonPath) {
    await mkdir(dirname(options.jsonPath), { recursive: true })
    await writeFile(options.jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
    console.log(`\nJSON report: ${options.jsonPath}`)
  }
  return output
}

if (import.meta.main) {
  report(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
