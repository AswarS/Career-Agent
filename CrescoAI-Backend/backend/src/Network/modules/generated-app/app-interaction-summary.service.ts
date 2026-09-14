import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'
import { ArtifactEntity } from '../artifact/entities/artifact.entity.js'
import { GeneratedAppEventEntity } from './entities/generated-app-event.entity.js'
import { GeneratedAppService } from './generated-app.service.js'

/** Data keys the renderer runtime allow-lists (mirrors agent-telemetry.js). */
const SAFE_DATA_KEYS = new Set([
  'correct',
  'errorCategory',
  'attempt',
  'hintLevel',
  'valueBucket',
  'parameter',
  'direction',
  'outcome',
  'milestone',
  'durationBucket',
  'itemType',
  'difficulty',
  'coverage',
  'completed',
  'score',
  'bestStreak',
  'attempts',
])

const MAX_APPS = 12
const MAX_DETAILED_EVENTS = 20
const MAX_INFERENCES = 6
const MAX_TOTAL_CHARS = 2400
const MAX_VALUE_CHARS = 80

type FeedbackInfo = {
  completed: boolean
  observationCount: number
  inferenceCount: number
}

function parseMetadata(
  metadataJson?: string,
): Record<string, unknown> | undefined {
  if (!metadataJson) return undefined
  try {
    const value = JSON.parse(metadataJson)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function parseFeedback(feedbackJson: string): FeedbackInfo | undefined {
  try {
    const feedback = JSON.parse(feedbackJson) as {
      session?: { completed?: unknown }
      observations?: unknown[]
      inferences?: unknown[]
    }
    if (!feedback || typeof feedback !== 'object') return undefined
    return {
      completed: feedback.session?.completed === true,
      observationCount: Array.isArray(feedback.observations)
        ? feedback.observations.length
        : 0,
      // App-authored inference prose is deliberately never injected into the
      // model prompt. It is untrusted content; only the aggregate count is
      // useful here. Evidence comes from allow-listed structured events above.
      inferenceCount: Array.isArray(feedback.inferences)
        ? feedback.inferences.length
        : 0,
    }
  } catch {
    return undefined
  }
}

function renderData(dataJson: string): string {
  let data: unknown
  try {
    data = JSON.parse(dataJson)
  } catch {
    return ''
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!SAFE_DATA_KEYS.has(key)) continue
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      parts.push(`${key}:${String(value).slice(0, MAX_VALUE_CHARS)}`)
    }
  }
  return parts.join(', ')
}

/**
 * Preserve the raw audit log while presenting lifecycle state transitions
 * once. Keep the latest completion because it carries the most complete
 * feedback envelope when an older runtime emitted completion twice.
 */
function collapseRepeatedCompletions(
  events: GeneratedAppEventEntity[],
): GeneratedAppEventEntity[] {
  const seenSessions = new Set<string>()
  return [...events]
    .reverse()
    .filter(event => {
      if (event.type !== 'session_completed') return true
      if (seenSessions.has(event.sessionId)) return false
      seenSessions.add(event.sessionId)
      return true
    })
    .reverse()
}

@Injectable()
export class AppInteractionSummaryService {
  constructor(
    @InjectRepository(ArtifactEntity)
    private readonly artifactRepo: Repository<ArtifactEntity>,
    @InjectRepository(GeneratedAppEventEntity)
    private readonly eventRepo: Repository<GeneratedAppEventEntity>,
    private readonly generatedAppService: GeneratedAppService,
  ) {}

  /**
   * Compact per-turn summary of the user's app interactions since `sinceMs`.
   * Apps deliberately cross conversation boundaries: a user can open an app
   * from Work and ask about it in a new chat. Only telemetry allow-listed event
   * types are rendered in detail; other events contribute to counts only.
   * Never throws.
   */
  async buildTurnPrompt(
    userId: number,
    _conversationId: string,
    sinceMs: number,
  ): Promise<string | undefined> {
    try {
      const appRows = await this.generatedAppService.listRowsForUser(userId)
      const versionByAppId = new Map<string, number>()
      for (const row of appRows) {
        if (row.appId) versionByAppId.set(row.appId, row.version ?? 1)
      }

      const artifacts = await this.artifactRepo.find({
        where: { userId, kind: 'app' },
      })
      const artifactByAppId = new Map<string, ArtifactEntity>()
      const allowlistByAppId = new Map<string, Set<string>>()
      for (const artifact of artifacts) {
        const metadata = parseMetadata(artifact.metadataJson)
        const appId =
          typeof metadata?.app_id === 'string'
            ? metadata.app_id
            : typeof metadata?.artifact_uid === 'string'
              ? metadata.artifact_uid
              : undefined
        if (!appId) continue
        artifactByAppId.set(appId, artifact)
        const events = metadata?.telemetry as { events?: unknown } | undefined
        if (Array.isArray(events?.events)) {
          allowlistByAppId.set(
            appId,
            new Set(
              events.events.filter(
                (item): item is string => typeof item === 'string',
              ),
            ),
          )
        }
        if (
          typeof metadata?.version === 'number' &&
          !versionByAppId.has(appId)
        ) {
          versionByAppId.set(appId, metadata.version as number)
        }
      }

      const appIds = [
        ...new Set([...versionByAppId.keys(), ...artifactByAppId.keys()]),
      ]
      if (appIds.length === 0) return undefined

      const rawEvents = await this.eventRepo.find({
        where: {
          userId,
          appId: In(appIds),
          createdAt: MoreThanOrEqual(new Date(sinceMs)),
        },
        order: { appId: 'ASC', at: 'ASC' },
        take: 500,
      })
      if (rawEvents.length === 0) return undefined
      const events = collapseRepeatedCompletions(rawEvents)

      const lines: string[] = []
      lines.push('## 近期应用交互回放（按用户跨对话）')
      const byApp = new Map<string, typeof events>()
      for (const event of events) {
        const list = byApp.get(event.appId) ?? []
        list.push(event)
        byApp.set(event.appId, list)
      }

      let detailedCount = 0
      let inferenceCount = 0
      const appEntries = [...byApp.entries()].slice(0, MAX_APPS)
      for (const [appId, appEvents] of appEntries) {
        if (lines.join('\n').length > MAX_TOTAL_CHARS) break
        const artifact = artifactByAppId.get(appId)
        const title = artifact?.title ?? appId
        const version = versionByAppId.get(appId) ?? 1
        const counts = new Map<string, number>()
        for (const event of appEvents) {
          counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
        }
        const countText = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([type, count]) => `${type}×${count}`)
          .join(', ')
        lines.push(
          `App「${title}」v${version}: ${appEvents.length} 条事件 — ${countText}`,
        )

        const allowlist = allowlistByAppId.get(appId)
        for (const event of appEvents) {
          if (detailedCount >= MAX_DETAILED_EVENTS) break
          if (!allowlist || !allowlist.has(event.type)) continue
          const dataText = event.dataJson ? renderData(event.dataJson) : ''
          lines.push(
            `[seq ${event.seq}] ${event.type}${dataText ? ` {${dataText}}` : ''}`,
          )
          detailedCount += 1
        }

        const feedbackEvent = [...appEvents]
          .reverse()
          .find(event => event.feedbackJson)
        if (feedbackEvent?.feedbackJson && inferenceCount < MAX_INFERENCES) {
          const feedback = parseFeedback(feedbackEvent.feedbackJson)
          if (feedback) {
            lines.push(
              `会话反馈: 完成度 ${feedback.completed}; observations ${feedback.observationCount}; inferences ${feedback.inferenceCount}`,
            )
            inferenceCount += feedback.inferenceCount
          }
        }
      }

      const result = lines.join('\n')
      return result.length > MAX_TOTAL_CHARS
        ? `${result.slice(0, MAX_TOTAL_CHARS)}…`
        : result
    } catch {
      return undefined
    }
  }
}
