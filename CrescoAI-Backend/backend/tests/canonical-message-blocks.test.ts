import { describe, expect, test } from 'bun:test'
import {
  normalizeCanonicalMessageBlocks,
  type CanonicalMessageBlock,
} from '../src/Network/modules/conversation/canonical-message-blocks.js'

describe('canonical message block projection', () => {
  test('normalizes transcript and completed stream trajectories identically', () => {
    const transcriptBlocks: CanonicalMessageBlock[] = [
      {
        id: 'skill-call',
        type: 'skill',
        name: 'career_direction_exploration',
        text: 'Skill command selected: /career_direction_exploration.',
      },
      { id: 'status-transcript', type: 'status', title: '过程', text: '分析用户需求。' },
      {
        id: 'tool-call-read',
        type: 'tool_call',
        name: 'Read',
        toolUseId: 'read-1',
        text: '正在调用 Read。',
      },
      {
        id: 'tool-result-read',
        type: 'tool_result',
        name: 'Read',
        toolUseId: 'read-1',
        text: '读取完成。',
      },
      { id: 'transcript-final', type: 'text', text: '完整最终回复' },
      { id: 'artifact-0', type: 'artifact', title: '生成内容' },
    ]
    const streamBlocks: CanonicalMessageBlock[] = [
      {
        id: 'skill-loaded-career_direction_exploration',
        type: 'status',
        title: 'Skill',
        name: 'career_direction_exploration',
        status: 'completed',
        text: 'Skill career_direction_exploration loaded',
      },
      { id: 'legacy-status-0', type: 'status', title: '思考', text: '分析用户需求。' },
      ...transcriptBlocks.slice(2, 4),
      { id: 'final-text-0', type: 'text', text: '不完整回复' },
      transcriptBlocks[5]!,
    ]

    const options = { authoritativeText: '完整最终回复' }
    expect(normalizeCanonicalMessageBlocks(streamBlocks, options)).toEqual(
      normalizeCanonicalMessageBlocks(transcriptBlocks, options),
    )
    expect(normalizeCanonicalMessageBlocks(streamBlocks, options)?.[1]?.title).toBe('思考')
  })
})
