import { describe, expect, test } from 'bun:test'
import {
  parseConversationMemorySummary,
  validateConversationMemorySummary,
} from '../src/Network/memory/conversationMemoryStorage.js'

const conversationId = 'a36f7863-6dab-4542-b502-66b13d350720'
const requiredTurnId = 'c166df75-a181-4d30-88a8-4517f407bde8'

function summaryWithBody(body: string): string {
  return [
    '---',
    'schema_version: 1',
    `conversation_id: ${conversationId}`,
    `transcript_file: ${conversationId}.jsonl`,
    `last_processed_turn: ${requiredTurnId}`,
    'updated_at: 2026-09-13T15:05:00.000Z',
    'revision: 1',
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
})
