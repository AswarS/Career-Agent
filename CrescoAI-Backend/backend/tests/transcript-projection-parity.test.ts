import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ConversationTranscriptProjectionService } from '../src/Network/modules/conversation/transcript-projection.service.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('conversation transcript trajectory projection', () => {
  test('merges one model execution chain into the same trajectory returned after streaming', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'career-agent-transcript-'))
    tempDirs.push(dir)
    const filePath = join(dir, 'session.jsonl')
    const events = [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-07-12T00:00:00.000Z',
        sessionId: 'session-1',
        message: { id: 'user-message-1', role: 'user', content: '请分析职业方向' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        timestamp: '2026-07-12T00:00:01.000Z',
        sessionId: 'session-1',
        message: {
          id: 'assistant-message-1',
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '先判断应该加载哪个能力。' },
            {
              type: 'tool_use',
              id: 'skill-call-1',
              name: 'Skill',
              input: { skill: 'career_direction_exploration' },
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'skill-result-1',
        timestamp: '2026-07-12T00:00:02.000Z',
        sessionId: 'session-1',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'skill-call-1',
            content: 'Launching skill: career_direction_exploration',
          }],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        timestamp: '2026-07-12T00:00:03.000Z',
        sessionId: 'session-1',
        message: {
          id: 'assistant-message-2',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'read-1', name: 'Read', input: { path: 'README.md' } }],
        },
      },
      {
        type: 'user',
        uuid: 'read-result-1',
        timestamp: '2026-07-12T00:00:04.000Z',
        sessionId: 'session-1',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'read-1', content: '读取完成。' }],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-3',
        timestamp: '2026-07-12T00:00:05.000Z',
        sessionId: 'session-1',
        message: {
          id: 'assistant-message-3',
          role: 'assistant',
          content: [{ type: 'text', text: '这是完整最终回复。' }],
        },
      },
    ]
    await writeFile(filePath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')

    const messages = await new ConversationTranscriptProjectionService().projectTranscriptFile({
      filePath,
      sessionId: 'session-1',
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]?.id).toBe('assistant-message-1')
    expect(messages[1]?.content).toBe('这是完整最终回复。')
    expect(messages[1]?.blocks?.map((block) => block.type)).toEqual([
      'status',
      'status',
      'tool_call',
      'tool_result',
      'text',
    ])
    expect(messages[1]?.blocks?.[0]).toMatchObject({
      id: 'status-0',
      title: '思考',
      text: '先判断应该加载哪个能力。',
    })
    expect(messages[1]?.blocks?.[1]).toMatchObject({
      id: 'skill-loaded-career_direction_exploration',
      title: 'Skill',
      text: 'Skill career_direction_exploration loaded',
    })
    expect(messages[1]?.blocks?.at(-1)).toEqual({
      id: 'text-0',
      type: 'text',
      text: '这是完整最终回复。',
    })
  })
})
