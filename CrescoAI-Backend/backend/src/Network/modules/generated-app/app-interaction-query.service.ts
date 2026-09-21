import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'
import { GeneratedAppEventEntity } from './entities/generated-app-event.entity.js'
import { GeneratedAppService } from './generated-app.service.js'

const MAX_QUERY_EVENTS = 10_000
const MAX_RETURNED_EVENTS = 100
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:+/-]{0,79}$/

type Scalar = string | number | boolean

export type AppInteractionReadInput = {
  mode: 'list_apps' | 'latest_session' | 'recent_sessions' | 'session'
  app_ref?: string
  session_id?: string
  since?: string
  limit?: number
  include_events?: boolean
  event_limit?: number
}

type AppDescriptor = {
  app_id: string
  title: string
  logical_object_id?: string
  version: number
  origin_conversation_id?: string
  created_at: string
  updated_at: string
}

type SafeEvent = {
  seq: number
  type: string
  at: string
  data?: Record<string, Scalar>
}

type SessionSummary = {
  app: AppDescriptor
  session_id: string
  status: 'active' | 'completed' | 'cleared'
  started_at: string
  last_event_at: string
  wall_span_ms: number
  reported_duration_ms?: number
  reported_duration_semantics?: 'app_reported_session_duration'
  completed_at?: string
  raw_event_count: number
  logical_event_count: number
  duplicate_completion_events: number
  event_counts: Record<string, number>
  post_completion?: {
    event_count: number
    event_counts: Record<string, number>
    first_event_at: string
    last_event_at: string
  }
  metrics: {
    evaluated_count?: number
    correct_count?: number
    incorrect_count?: number
    accuracy?: number
    latest_values: Record<string, Scalar>
    observations: Array<{
      metric: string
      value: Scalar
      evidence?: number[]
    }>
  }
  events?: SafeEvent[]
  data_quality: {
    source: 'generated_app_events'
    unsafe_string_values_omitted: number
    events_truncated: boolean
    lifecycle_anomalies: string[]
  }
}

export type AppInteractionReadResult = {
  schema: 'app-interaction-read/1.0'
  mode: AppInteractionReadInput['mode']
  matched_apps: AppDescriptor[]
  sessions: SessionSummary[]
  query: {
    app_ref?: string
    session_id?: string
    since?: string
    limit: number
    include_events: boolean
  }
  data_quality: {
    event_scan_truncated: boolean
    notes: string[]
  }
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function safeScalar(value: unknown): Scalar | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  if (typeof value === 'string' && SAFE_IDENTIFIER.test(value)) return value
  return undefined
}

function parseSafeData(dataJson?: string): {
  data: Record<string, Scalar>
  omitted: number
} {
  if (!dataJson) return { data: {}, omitted: 0 }
  try {
    const parsed = JSON.parse(dataJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, omitted: 0 }
    }
    const data: Record<string, Scalar> = {}
    let omitted = 0
    for (const [key, value] of Object.entries(parsed)) {
      if (!SAFE_IDENTIFIER.test(key)) {
        omitted += 1
        continue
      }
      const safe = safeScalar(value)
      if (safe === undefined) omitted += 1
      else data[key] = safe
    }
    return { data, omitted }
  } catch {
    return { data: {}, omitted: 0 }
  }
}

function parseSafeObservations(feedbackJson?: string): Array<{
  metric: string
  value: Scalar
  evidence?: number[]
}> {
  if (!feedbackJson) return []
  try {
    const parsed = JSON.parse(feedbackJson) as { observations?: unknown[] }
    if (!Array.isArray(parsed?.observations)) return []
    return parsed.observations.slice(0, 10).flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      if (typeof record.metric !== 'string' || !SAFE_IDENTIFIER.test(record.metric)) {
        return []
      }
      const value = safeScalar(record.value)
      if (value === undefined) return []
      const evidence = Array.isArray(record.evidence)
        ? record.evidence.filter(
            (entry): entry is number => Number.isInteger(entry) && entry >= 0,
          ).slice(0, 50)
        : undefined
      return [{
        metric: record.metric,
        value,
        ...(evidence?.length ? { evidence } : {}),
      }]
    })
  } catch {
    return []
  }
}

function parseReportedDuration(feedbackJson?: string): number | undefined {
  if (!feedbackJson) return undefined
  try {
    const parsed = JSON.parse(feedbackJson) as {
      session?: { durationMs?: unknown }
    }
    const value = parsed?.session?.durationMs
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : undefined
  } catch {
    return undefined
  }
}

function describeApp(row: Awaited<ReturnType<GeneratedAppService['listRowsForUser']>>[number]): AppDescriptor | undefined {
  if (!row.appId) return undefined
  return {
    app_id: row.appId,
    title: row.appName,
    ...(row.logicalObjectId ? { logical_object_id: row.logicalObjectId } : {}),
    version: row.version ?? 1,
    ...(row.conversationId
      ? { origin_conversation_id: row.conversationId }
      : {}),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  }
}

function matchesAppRef(app: AppDescriptor, appRef: string): boolean {
  const needle = appRef.trim().toLocaleLowerCase()
  if (!needle) return true
  return [app.app_id, app.title, app.logical_object_id]
    .filter((value): value is string => Boolean(value))
    .some(value => value.toLocaleLowerCase().includes(needle))
}

function summarizeSession(
  app: AppDescriptor,
  rawEvents: GeneratedAppEventEntity[],
  includeEvents: boolean,
  eventLimit: number,
): SessionSummary {
  const ordered = [...rawEvents].sort(
    (left, right) => left.at.getTime() - right.at.getTime() || left.seq - right.seq,
  )
  const latestCompletionIndex = ordered.findLastIndex(
    event => event.type === 'session_completed',
  )
  let duplicateCompletionEvents = 0
  const logicalEvents = ordered.filter((event, index) => {
    if (event.type !== 'session_completed') return true
    if (index === latestCompletionIndex) return true
    duplicateCompletionEvents += 1
    return false
  })
  const eventCounts: Record<string, number> = {}
  const latestValues: Record<string, Scalar> = {}
  let evaluatedCount = 0
  let correctCount = 0
  let omitted = 0
  const safeEvents: SafeEvent[] = []

  for (const event of logicalEvents) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1
    const parsed = parseSafeData(event.dataJson)
    omitted += parsed.omitted
    for (const [key, value] of Object.entries(parsed.data)) {
      latestValues[key] = value
    }
    if (typeof parsed.data.correct === 'boolean') {
      evaluatedCount += 1
      if (parsed.data.correct) correctCount += 1
    }
    if (includeEvents && safeEvents.length < eventLimit) {
      safeEvents.push({
        seq: event.seq,
        type: event.type,
        at: iso(event.at),
        ...(Object.keys(parsed.data).length ? { data: parsed.data } : {}),
      })
    }
  }

  const lastFeedback = [...ordered]
    .reverse()
    .find(event => Boolean(event.feedbackJson))
  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const cleared = logicalEvents.some(event => event.type === 'session_cleared')
  const completed = logicalEvents.some(event => event.type === 'session_completed')
  const latestCompletionPosition = logicalEvents.findLastIndex(
    event => event.type === 'session_completed',
  )
  const completionEvent = latestCompletionPosition >= 0
    ? logicalEvents[latestCompletionPosition]
    : undefined
  const postCompletionEvents = latestCompletionPosition >= 0
    ? logicalEvents.slice(latestCompletionPosition + 1)
    : []
  const postCompletionEventCounts: Record<string, number> = {}
  for (const event of postCompletionEvents) {
    postCompletionEventCounts[event.type] =
      (postCompletionEventCounts[event.type] ?? 0) + 1
  }
  const lifecycleAnomalies = postCompletionEvents.length > 0
    ? ['events_after_session_completed']
    : []
  const reportedDurationMs = parseReportedDuration(lastFeedback?.feedbackJson)
  const metrics: SessionSummary['metrics'] = {
    latest_values: latestValues,
    observations: parseSafeObservations(lastFeedback?.feedbackJson),
  }
  if (evaluatedCount > 0) {
    metrics.evaluated_count = evaluatedCount
    metrics.correct_count = correctCount
    metrics.incorrect_count = evaluatedCount - correctCount
    metrics.accuracy = correctCount / evaluatedCount
  }

  return {
    app,
    session_id: first.sessionId,
    status: cleared ? 'cleared' : completed ? 'completed' : 'active',
    started_at: iso(first.at),
    last_event_at: iso(last.at),
    wall_span_ms: Math.max(0, last.at.getTime() - first.at.getTime()),
    ...(reportedDurationMs !== undefined
      ? {
          reported_duration_ms: reportedDurationMs,
          reported_duration_semantics: 'app_reported_session_duration' as const,
        }
      : {}),
    ...(completionEvent ? { completed_at: iso(completionEvent.at) } : {}),
    raw_event_count: ordered.length,
    logical_event_count: logicalEvents.length,
    duplicate_completion_events: duplicateCompletionEvents,
    event_counts: eventCounts,
    ...(postCompletionEvents.length > 0
      ? {
          post_completion: {
            event_count: postCompletionEvents.length,
            event_counts: postCompletionEventCounts,
            first_event_at: iso(postCompletionEvents[0]!.at),
            last_event_at: iso(postCompletionEvents.at(-1)!.at),
          },
        }
      : {}),
    metrics,
    ...(includeEvents ? { events: safeEvents } : {}),
    data_quality: {
      source: 'generated_app_events',
      unsafe_string_values_omitted: omitted,
      events_truncated: includeEvents && logicalEvents.length > eventLimit,
      lifecycle_anomalies: lifecycleAnomalies,
    },
  }
}

@Injectable()
export class AppInteractionQueryService {
  constructor(
    private readonly generatedAppService: GeneratedAppService,
    @InjectRepository(GeneratedAppEventEntity)
    private readonly eventRepo: Repository<GeneratedAppEventEntity>,
  ) {}

  async read(
    userId: number,
    input: AppInteractionReadInput,
  ): Promise<AppInteractionReadResult> {
    const rows = await this.generatedAppService.listRowsForUser(userId)
    const allApps = rows
      .map(describeApp)
      .filter((app): app is AppDescriptor => Boolean(app))
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    const matchedApps = input.app_ref
      ? allApps.filter(app => matchesAppRef(app, input.app_ref!))
      : allApps
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 20)
    const includeEvents = input.include_events === true
    const eventLimit = Math.min(
      Math.max(input.event_limit ?? 30, 1),
      MAX_RETURNED_EVENTS,
    )
    const query = {
      ...(input.app_ref ? { app_ref: input.app_ref } : {}),
      ...(input.session_id ? { session_id: input.session_id } : {}),
      ...(input.since ? { since: input.since } : {}),
      limit,
      include_events: includeEvents,
    }
    const base: Omit<AppInteractionReadResult, 'sessions'> = {
      schema: 'app-interaction-read/1.0',
      mode: input.mode,
      matched_apps: matchedApps,
      query,
      data_quality: {
        event_scan_truncated: false,
        notes: [
          'Results are authenticated user-scoped and may span conversations and app versions.',
          'App-authored inference prose and unsafe string values are not returned.',
          'reported_duration_ms is supplied by the app and is not necessarily active task time.',
          'Describe only the returned counts and evidence; do not infer unseen task structure.',
          'Event names alone do not prove user causality. Treat session/app lifecycle and automatic start events as system behavior unless a separate action event or structured data proves a user control was used.',
        ],
      },
    }
    if (input.mode === 'list_apps' || matchedApps.length === 0) {
      return { ...base, sessions: [] }
    }

    const appById = new Map(matchedApps.map(app => [app.app_id, app]))
    const appIds = [...appById.keys()]
    const since = input.since ? new Date(input.since) : undefined
    const where = {
      userId,
      appId: In(appIds),
      ...(input.session_id ? { sessionId: input.session_id } : {}),
      ...(since ? { at: MoreThanOrEqual(since) } : {}),
    }
    const events = await this.eventRepo.find({
      where,
      order: { at: 'DESC', seq: 'DESC' },
      take: MAX_QUERY_EVENTS,
    })
    base.data_quality.event_scan_truncated = events.length === MAX_QUERY_EVENTS

    const groups = new Map<string, GeneratedAppEventEntity[]>()
    for (const event of events) {
      const key = `${event.appId}\u0000${event.sessionId}`
      const list = groups.get(key) ?? []
      list.push(event)
      groups.set(key, list)
    }
    const sessions = [...groups.values()]
      .map(group => {
        const app = appById.get(group[0]!.appId)
        return app
          ? summarizeSession(app, group, includeEvents, eventLimit)
          : undefined
      })
      .filter((session): session is SessionSummary => Boolean(session))
      .sort((left, right) => right.last_event_at.localeCompare(left.last_event_at))

    const selected = input.mode === 'latest_session'
      ? sessions.slice(0, 1)
      : input.mode === 'session'
        ? sessions.filter(session => session.session_id === input.session_id).slice(0, 1)
        : sessions.slice(0, limit)
    return { ...base, sessions: selected }
  }
}
