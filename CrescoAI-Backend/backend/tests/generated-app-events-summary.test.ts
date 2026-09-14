import { describe, expect, test } from 'bun:test'
import { AppInteractionSummaryService } from '../src/Network/modules/generated-app/app-interaction-summary.service.js'

function eventRow(partial: Record<string, unknown>) {
  return {
    id: 1,
    userId: 3,
    appId: 'web-app-sample',
    sessionId: 'session-1',
    seq: 1,
    type: 'attempt_submitted',
    at: new Date(),
    dataJson: undefined,
    feedbackJson: undefined,
    payloadHash: 'hash',
    createdAt: new Date(),
    ...partial,
  } as never
}

function artifactRow(
  metadata: Record<string, unknown>,
  conversationId = 'conv-1',
) {
  return {
    id: 1,
    userId: 3,
    conversationId,
    kind: 'app',
    type: 'generated-app',
    title: '分数加减法练习',
    metadataJson: JSON.stringify(metadata),
  } as never
}

function buildService(input: {
  appRows: Array<{ appId?: string; version?: number }>
  artifacts: unknown[]
  events: unknown[]
}) {
  const service = new AppInteractionSummaryService(
    { find: async () => input.artifacts } as never,
    { find: async () => input.events } as never,
    {
      listRowsForUser: async () => input.appRows,
    } as never,
  )
  return service
}

describe('AppInteractionSummaryService.buildTurnPrompt', () => {
  test('returns undefined when there are no recent events', async () => {
    const service = buildService({
      appRows: [{ appId: 'web-app-sample', version: 1 }],
      artifacts: [artifactRow({ app_id: 'web-app-sample', version: 1 })],
      events: [],
    })
    expect(await service.buildTurnPrompt(3, 'conv-1', 0)).toBeUndefined()
  })

  test('renders allow-listed events in detail and counts the rest', async () => {
    const service = buildService({
      appRows: [{ appId: 'web-app-sample', version: 2 }],
      artifacts: [
        artifactRow({
          app_id: 'web-app-sample',
          version: 2,
          telemetry: { events: ['attempt_submitted'] },
        }),
      ],
      events: [
        eventRow({
          seq: 3,
          type: 'attempt_submitted',
          dataJson: '{"correct":false,"errorCategory":"addition-error"}',
        }),
        eventRow({ seq: 4, type: 'run_completed' }),
      ],
    })
    const prompt = await service.buildTurnPrompt(3, 'conv-1', 0)
    expect(prompt).toContain('应用交互回放')
    expect(prompt).toContain('分数加减法练习')
    expect(prompt).toContain('v2')
    expect(prompt).toContain('attempt_submitted×1')
    expect(prompt).toContain('run_completed×1')
    expect(prompt).toContain('errorCategory:addition-error')
    expect(prompt).not.toContain('[seq 4] run_completed')
  })

  test('replays a user app from an older conversation into a new chat', async () => {
    const service = buildService({
      appRows: [{ appId: 'web-app-sample', version: 1 }],
      artifacts: [
        artifactRow(
          {
            app_id: 'web-app-sample',
            version: 1,
            telemetry: { events: ['session_completed'] },
          },
          'conv-old',
        ),
      ],
      events: [
        eventRow({
          seq: 13,
          type: 'session_completed',
          dataJson: '{"score":10,"bestStreak":10,"attempts":10}',
        }),
        eventRow({
          seq: 14,
          type: 'session_completed',
          dataJson: '{"score":10,"bestStreak":10,"attempts":10}',
        }),
      ],
    })
    const prompt = await service.buildTurnPrompt(3, 'conv-new', 0)
    expect(prompt).toContain('按用户跨对话')
    expect(prompt).toContain('分数加减法练习')
    expect(prompt).toContain('score:10')
    expect(prompt).toContain('bestStreak:10')
    expect(prompt).toContain('attempts:10')
    expect(prompt).toContain('session_completed×1')
    expect(prompt).not.toContain('session_completed×2')
  })

  test('counts only without an allowlist (legacy app)', async () => {
    const service = buildService({
      appRows: [],
      artifacts: [artifactRow({ app_id: 'web-app-sample', version: 1 })],
      events: [
        eventRow({
          seq: 1,
          type: 'attempt_submitted',
          dataJson: '{"correct":true}',
        }),
      ],
    })
    const prompt = await service.buildTurnPrompt(3, 'conv-1', 0)
    expect(prompt).toContain('attempt_submitted×1')
    expect(prompt).not.toContain('correct:true')
  })

  test('renders feedback aggregates without trusting app-authored inference prose', async () => {
    const service = buildService({
      appRows: [{ appId: 'web-app-sample', version: 1 }],
      artifacts: [
        artifactRow({
          app_id: 'web-app-sample',
          version: 1,
          telemetry: { events: ['attempt_submitted'] },
        }),
      ],
      events: [
        eventRow({
          seq: 5,
          type: 'attempt_submitted',
          feedbackJson: JSON.stringify({
            session: { completed: true, durationMs: 90000, eventCount: 28 },
            observations: [{ metric: 'firstAttemptAccuracy', value: 0.5 }],
            inferences: [
              {
                statement: 'Benefit: visual example first',
                confidence: 'medium',
                evidence: [1, 2],
                nextAction: 'Show a worked example',
              },
            ],
            limitations: ['short session'],
          }),
        }),
      ],
    })
    const prompt = await service.buildTurnPrompt(3, 'conv-1', 0)
    expect(prompt).toContain('完成度 true')
    expect(prompt).toContain('observations 1; inferences 1')
    expect(prompt).not.toContain('visual example first')
    expect(prompt).not.toContain('confidence: medium')
  })

  test('never throws on malformed rows', async () => {
    const service = new AppInteractionSummaryService(
      {
        find: async () => {
          throw new Error('db down')
        },
      } as never,
      { find: async () => [] } as never,
      { listRowsForUser: async () => [] } as never,
    )
    expect(await service.buildTurnPrompt(3, 'conv-1', 0)).toBeUndefined()
  })
})
