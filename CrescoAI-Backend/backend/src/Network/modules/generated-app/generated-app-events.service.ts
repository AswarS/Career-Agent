import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v4'
import { GeneratedAppEventEntity } from './entities/generated-app-event.entity.js'

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,48}$/
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const MAX_EVENTS_PER_BATCH = 50
const MAX_DATA_BYTES = 4_096
const MAX_FUTURE_SKEW_MS = 5 * 60_000
const MAX_AGE_MS = 30 * 24 * 3_600_000

/**
 * Closed data-key allowlist, mirroring the renderer runtime
 * (skills/develop-web-game/assets/agent-telemetry.js). Free text never
 * reaches storage: unknown keys are rejected, not stored.
 */
export const SAFE_EVENT_DATA_KEYS = new Set([
  'correct', 'errorCategory', 'attempt', 'hintLevel', 'valueBucket',
  'parameter', 'direction', 'outcome', 'milestone', 'durationBucket',
  'itemType', 'difficulty', 'coverage', 'completed',
  'score', 'bestStreak', 'attempts',
])

const appEventBatchSchema = z.strictObject({
  schema: z.literal('app-event-batch/1.0'),
  session_id: z.string().regex(SESSION_ID_PATTERN),
  sequence_start: z.number().int().min(0),
  events: z
    .array(
      z.strictObject({
        seq: z.number().int().min(0),
        type: z.string().regex(EVENT_TYPE_PATTERN),
        at: z.string().datetime({ offset: true }),
        target: z.string().min(1).max(80).optional(),
        data: z
          .record(
            z.string(),
            z.union([z.string().max(120), z.number(), z.boolean()]),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(MAX_EVENTS_PER_BATCH),
  session: z
    .strictObject({
      durationMs: z.number().int().min(0),
      eventCount: z.number().int().min(0),
      completed: z.boolean(),
    })
    .optional(),
  feedback: z
    .strictObject({
      schema: z.literal('multi-agent-feedback/1.0'),
      session: z
        .strictObject({
          id: z.string().max(128).optional(),
          durationMs: z.number().int().min(0),
          eventCount: z.number().int().min(0),
          completed: z.boolean(),
          storage: z.enum(['local', 'memory']).optional(),
        })
        .optional(),
      observations: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
      inferences: z
        .array(
          z.strictObject({
            statement: z.string().min(1).max(500),
            confidence: z.enum(['low', 'medium', 'high']),
            evidence: z.array(z.number().int()).min(1).max(50),
            nextAction: z.string().min(1).max(500),
          }),
        )
        .max(10)
        .optional(),
      limitations: z.array(z.string().min(1).max(500)).max(5).optional(),
      recentEvents: z.array(z.unknown()).max(20).optional(),
    })
    .optional(),
})

export type AppEventBatch = z.infer<typeof appEventBatchSchema>

export type AppEventBatchValidation =
  | { ok: true; envelope: AppEventBatch }
  | { ok: false; error: string; issues: string[] }

/**
 * Validate an uploaded event batch before any database work. Pure and
 * exported so both the controller and unit tests share one implementation.
 */
export function validateAppEventBatch(body: unknown): AppEventBatchValidation {
  const parsed = appEventBatchSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_envelope',
      issues: parsed.error.issues
        .slice(0, 10)
        .map(issue => `${issue.path.join('.')}: ${issue.message}`),
    }
  }
  const envelope = parsed.data
  const issues: string[] = []
  const now = Date.now()

  envelope.events.forEach((event, index) => {
    if (event.seq !== envelope.sequence_start + index) {
      issues.push(`events[${index}].seq must equal sequence_start + index`)
    }
    const atMs = Date.parse(event.at)
    if (Number.isNaN(atMs)) {
      issues.push(`events[${index}].at must be an ISO datetime`)
    } else if (atMs > now + MAX_FUTURE_SKEW_MS) {
      issues.push(`events[${index}].at cannot be more than 5 minutes in the future`)
    } else if (atMs < now - MAX_AGE_MS) {
      issues.push(`events[${index}].at cannot be older than 30 days`)
    }
    if (event.data) {
      if (JSON.stringify(event.data).length > MAX_DATA_BYTES) {
        issues.push(`events[${index}].data exceeds ${MAX_DATA_BYTES} bytes`)
      }
      for (const key of Object.keys(event.data)) {
        if (!SAFE_EVENT_DATA_KEYS.has(key)) {
          issues.push(`events[${index}].data key ${JSON.stringify(key)} is not allow-listed`)
        }
      }
    }
  })

  if (issues.length > 0) {
    return { ok: false, error: 'invalid_envelope', issues: issues.slice(0, 10) }
  }
  return { ok: true, envelope }
}

/** Stable sha256 over the canonical event content; audit-only. */
export function hashAppEvent(event: {
  seq: number
  type: string
  at: string
  data?: Record<string, unknown>
}): string {
  return createHash('sha256')
    .update(JSON.stringify([event.seq, event.type, event.at, event.data ?? null]))
    .digest('hex')
}

export type AppEventIngestResult = { received: number; duplicates: number }

@Injectable()
export class GeneratedAppEventsService {
  constructor(
    @InjectRepository(GeneratedAppEventEntity)
    private readonly repo: Repository<GeneratedAppEventEntity>,
  ) {}

  /**
   * Idempotent by (appId, sessionId, seq): existing sequences are counted as
   * duplicates and never overwritten. The feedback payload, when present, is
   * stored on the last event row of the batch.
   */
  async ingest(
    userId: number,
    appId: string,
    envelope: AppEventBatch,
  ): Promise<AppEventIngestResult> {
    const seqs = envelope.events.map(event => event.seq)
    const existing = await this.repo.find({
      where: { appId, sessionId: envelope.session_id, seq: In(seqs) },
      select: ['seq'],
    })
    const existingSeq = new Set(existing.map(row => row.seq))

    const rows = envelope.events
      .filter(event => !existingSeq.has(event.seq))
      .map((event, index) =>
        this.repo.create({
          userId,
          appId,
          sessionId: envelope.session_id,
          seq: event.seq,
          type: event.type,
          at: new Date(event.at),
          dataJson:
            event.data && Object.keys(event.data).length > 0
              ? JSON.stringify(event.data)
              : undefined,
          feedbackJson:
            envelope.feedback && index === envelope.events.length - 1
              ? JSON.stringify(envelope.feedback)
              : undefined,
          payloadHash: hashAppEvent(event),
        }),
      )

    if (rows.length > 0) {
      // OR IGNORE keeps concurrent duplicate uploads idempotent.
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(GeneratedAppEventEntity)
        .values(rows as GeneratedAppEventEntity[])
        .orIgnore()
        .execute()
    }
    return { received: rows.length, duplicates: existingSeq.size }
  }

  async deleteByAppIds(userId: number, appIds: string[]): Promise<void> {
    const unique = [...new Set(appIds)].filter(Boolean)
    if (unique.length === 0) return
    await this.repo.delete({ userId, appId: In(unique) })
  }
}
