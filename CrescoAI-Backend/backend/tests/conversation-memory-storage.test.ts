import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getConversationMemoryEditPathError,
  getConversationMemoryPreWriteError,
  parseConversationMemorySummary,
  validateConversationMemorySummary,
} from '../src/Network/memory/conversationMemoryStorage.js'
import {
  runWithSessionContext,
  type SessionContext,
} from '../src/server/SessionContext.js'

const conversationId = 'a36f7863-6dab-4542-b502-66b13d350720'
const requiredTurnId = 'c166df75-a181-4d30-88a8-4517f407bde8'

function summaryWithBody(body: string, revision = 1): string {
  return [
    '---',
    'schema_version: 1',
    `conversation_id: ${conversationId}`,
    `transcript_file: ${conversationId}.jsonl`,
    `last_processed_turn: ${requiredTurnId}`,
    'updated_at: 2026-09-13T15:05:00.000Z',
    `revision: ${revision}`,
    'topic_hooks:',
    '  - session-context',
    '---',
    body,
  ].join('\n')
}

describe('conversation memory summary validation', () => {
  test('accepts blank lines between frontmatter and the required H1', () => {
    const content = summaryWithBody([
      '',
      '',
      `# ${conversationId}.jsonl`,
      '',
      '## Session context',
      '',
      '- A durable fact.',
      '',
    ].join('\n'))

    const parsed = validateConversationMemorySummary(content, {
      conversationId,
      requiredTurnId,
    })

    expect(parsed.body.startsWith(`# ${conversationId}.jsonl\n`)).toBe(true)
    expect(parseConversationMemorySummary(content).topics).toEqual(['Session context'])
  })

  test('still rejects an incorrect first body heading', () => {
    const content = summaryWithBody([
      '',
      '# Conversation summary',
      '',
      '## Session context',
      '',
      '- A durable fact.',
    ].join('\n'))

    expect(() => validateConversationMemorySummary(content, {
      conversationId,
      requiredTurnId,
    })).toThrow(`the first body heading must be "# ${conversationId}.jsonl"`)
  })

  test('requires one complete Write instead of partial Edit checkpoints', () => {
    const rootDir = join(tmpdir(), 'conversation-memory-edit-policy')
    const summaryPath = join(rootDir, 'sessions', `${conversationId}.md`)
    const context = memoryContext(rootDir, summaryPath)

    expect(
      runWithSessionContext(context, () =>
        getConversationMemoryEditPathError(summaryPath),
      ),
    ).toContain('one complete Write')
  })

  test('rejects a stale revision before the summary is written', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'conversation-memory-revision-'))
    const summaryPath = join(rootDir, 'sessions', `${conversationId}.md`)
    try {
      await mkdir(join(rootDir, 'state'), { recursive: true })
      await writeFile(
        join(rootDir, 'state', `${conversationId}.json`),
        JSON.stringify({ revision: 2 }),
        'utf8',
      )
      const context = memoryContext(rootDir, summaryPath)
      const content = summaryWithBody(
        ['', `# ${conversationId}.jsonl`, '', '## Session context', '', '- Fact.'].join('\n'),
        2,
      )

      await expect(
        runWithSessionContext(context, () =>
          getConversationMemoryPreWriteError(summaryPath, content),
        ),
      ).resolves.toBe('Conversation memory revision must be greater than 2')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})

function memoryContext(rootDir: string, summaryPath: string): SessionContext {
  return {
    sessionId: conversationId,
    userId: '1',
    state: {},
    config: { cwd: rootDir },
    anthropicClient: null,
    queryEngine: null,
    mcpClients: [],
    wsConnections: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    isHeadless: true,
    sessionSwitched: { subscribe: () => {}, emit: () => {} },
    pendingToolResponses: new Map(),
    conversationMemoryTurn: {
      enabled: true,
      userId: '1',
      conversationId,
      rootDir,
      sessionSummaryPath: summaryPath,
      transcriptPath: join(rootDir, `${conversationId}.jsonl`),
      requiredTurnId,
      reminderCount: 0,
      maxReminders: 2,
      writeMode: 'required',
      status: 'pending',
      privateConversationIds: new Set(),
    },
  }
}
