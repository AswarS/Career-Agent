import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { DataSource } from 'typeorm'
import { careerAgentEntities } from '../src/Network/database.config.js'
import { careerAgentMigrations } from '../src/Network/migrations/migration-list.js'
import {
  GeneratedAppEventsService,
  hashAppEvent,
  validateAppEventBatch,
} from '../src/Network/modules/generated-app/generated-app-events.service.js'
import { GeneratedAppEventEntity } from '../src/Network/modules/generated-app/entities/generated-app-event.entity.js'

function validBatch() {
  const now = new Date().toISOString()
  return {
    schema: 'app-event-batch/1.0',
    session_id: 'session-abc123',
    sequence_start: 1,
    events: [
      {
        seq: 1,
        type: 'attempt_submitted',
        at: now,
        data: { correct: false, errorCategory: 'addition-error', attempt: 1 },
      },
      { seq: 2, type: 'hint_requested', at: now, data: { hintLevel: 1 } },
    ],
  }
}

describe('validateAppEventBatch', () => {
  test('accepts a valid batch', () => {
    const result = validateAppEventBatch(validBatch())
    expect(result.ok).toBe(true)
  })

  test('accepts bounded aggregate score and count fields', () => {
    const batch = validBatch() as any
    batch.events[0].data = {
      score: 10,
      bestStreak: 7,
      attempts: 12,
    }
    expect(validateAppEventBatch(batch).ok).toBe(true)
  })

  test('rejects non-contiguous sequence numbers', () => {
    const batch = validBatch() as any
    batch.events[1].seq = 7
    const result = validateAppEventBatch(batch)
    expect(result.ok).toBe(false)
    if (result.ok === true) return
    expect(result.issues.join(' ')).toContain('sequence_start')
  })

  test('rejects invalid event types', () => {
    const batch = validBatch() as any
    batch.events[0].type = 'Bad Type!'
    const result = validateAppEventBatch(batch)
    expect(result.ok).toBe(false)
  })

  test('rejects events in the far future or older than 30 days', () => {
    const future = validBatch() as any
    future.events[0].at = new Date(Date.now() + 60 * 60_000).toISOString()
    expect(validateAppEventBatch(future).ok).toBe(false)

    const ancient = validBatch() as any
    ancient.events[0].at = new Date(Date.now() - 40 * 24 * 3_600_000).toISOString()
    expect(validateAppEventBatch(ancient).ok).toBe(false)
  })

  test('rejects non-allowlisted data keys and oversized data', () => {
    const badKey = validBatch() as any
    badKey.events[0].data = { freeText: 'raw user answer' }
    expect(validateAppEventBatch(badKey).ok).toBe(false)

    const oversized = validBatch() as any
    oversized.events[0].data = { errorCategory: 'x'.repeat(4097) }
    expect(validateAppEventBatch(oversized).ok).toBe(false)
  })

  test('rejects malformed feedback payloads', () => {
    const bad = validBatch() as any
    bad.feedback = {
      schema: 'multi-agent-feedback/1.0',
      inferences: [{ statement: '', confidence: 'high', evidence: [], nextAction: 'x' }],
    }
    expect(validateAppEventBatch(bad).ok).toBe(false)
  })
})

describe('hashAppEvent', () => {
  test('is stable and sensitive to content', () => {
    const event = { seq: 1, type: 'run_started', at: '2026-09-02T00:00:00.000Z', data: { difficulty: 2 } }
    expect(hashAppEvent(event)).toBe(hashAppEvent(event))
    expect(hashAppEvent({ ...event, seq: 2 })).not.toBe(hashAppEvent(event))
    expect(hashAppEvent(event)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('GeneratedAppEventsService.ingest', () => {
  test('inserts new events and treats resequenced duplicates as idempotent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-app-events-'))
    const dataSource = new DataSource({
      type: 'sqlite',
      database: join(directory, 'events.sqlite'),
      entities: careerAgentEntities,
      migrations: careerAgentMigrations,
      migrationsTransactionMode: 'all',
      synchronize: false,
    })
    try {
      await dataSource.initialize()
      await dataSource.runMigrations({ transaction: 'all' })
      const repo = dataSource.getRepository(GeneratedAppEventEntity)
      const service = new GeneratedAppEventsService(repo)

      const batch = validateAppEventBatch(validBatch())
      if (!batch.ok) throw new Error('fixture invalid')
      const first = await service.ingest(3, 'web-app-sample', batch.envelope)
      expect(first).toEqual({ received: 2, duplicates: 0 })

      const second = await service.ingest(3, 'web-app-sample', batch.envelope)
      expect(second).toEqual({ received: 0, duplicates: 2 })

      const rows = await repo.find()
      expect(rows).toHaveLength(2)
      expect(rows.find(row => row.seq === 1)?.payloadHash).toBe(
        hashAppEvent(batch.envelope.events[0]!),
      )
    } finally {
      await dataSource.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('agent telemetry runtime', () => {
  test('records session completion only once and retains aggregate fields', async () => {
    const source = await readFile(
      join(import.meta.dir, '../../../skills/develop-web-game/assets/agent-telemetry.js'),
      'utf8',
    )
    const stored = new Map<string, string>()
    const fakeWindow: Record<string, any> = {
      crypto: { randomUUID: () => 'session-runtime-test' },
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    }
    vm.runInNewContext(source, { window: fakeWindow })
    const telemetry = fakeWindow.createAgentTelemetry({
      appSlug: 'runtime-test',
      scene: 'practice',
    })

    const first = telemetry.record('session_completed', {
      data: { score: 10, bestStreak: 7, attempts: 12 },
    })
    const second = telemetry.record('session_completed', {
      data: { score: 10, bestStreak: 7, attempts: 12 },
    })
    const completions = telemetry
      .getEvents()
      .filter((event: { type: string }) => event.type === 'session_completed')

    expect(second).toBe(first)
    expect(completions).toHaveLength(1)
    expect(completions[0].data).toEqual({
      score: 10,
      bestStreak: 7,
      attempts: 12,
    })

    telemetry.record('checkpoint_reached', {
      milestone: 'stage_2',
      outcome: 'advanced',
    })
    expect(telemetry.getEvents().at(-1)?.data).toEqual({
      milestone: 'stage_2',
      outcome: 'advanced',
    })
  })
})
