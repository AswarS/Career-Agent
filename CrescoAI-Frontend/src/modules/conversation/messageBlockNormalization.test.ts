import { describe, expect, it } from 'vitest';
import type { MessageBlock } from '../../types/entities';
import { normalizeMessageBlocks } from './messageBlockNormalization';

describe('normalizeMessageBlocks dynamic/static parity', () => {
  it('produces the same completed trajectory from transcript and stream blocks', () => {
    const staticTranscriptBlocks: MessageBlock[] = [
      {
        id: 'skill-tool-call',
        type: 'skill',
        name: 'career_direction_exploration',
        text: 'Skill command selected: /career_direction_exploration.',
      },
      { id: 'status-0', type: 'status', title: '过程', text: '分析用户需求。' },
      {
        id: 'tool-call-read',
        type: 'tool_call',
        title: '工具调用 · Read',
        name: 'Read',
        toolUseId: 'read-1',
        text: '正在调用 Read。',
      },
      {
        id: 'tool-result-read',
        type: 'tool_result',
        title: '工具返回 · Read',
        name: 'Read',
        toolUseId: 'read-1',
        text: '读取完成。',
      },
      { id: 'transcript-text-4', type: 'text', text: '完整最终回复' },
      { id: 'artifact-0', type: 'artifact', title: '生成内容' },
    ];
    const dynamicCompletedBlocks: MessageBlock[] = [
      {
        id: 'skill-loaded-career_direction_exploration',
        type: 'status',
        title: 'Skill',
        name: 'career_direction_exploration',
        status: 'completed',
        text: 'Skill career_direction_exploration loaded',
      },
      { id: 'legacy-status-0', type: 'status', title: '思考', text: '分析用户需求。' },
      {
        id: 'tool-call-read',
        type: 'tool_call',
        title: '工具调用 · Read',
        name: 'Read',
        toolUseId: 'read-1',
        text: '正在调用 Read。',
      },
      {
        id: 'tool-result-read',
        type: 'tool_result',
        title: '工具返回 · Read',
        name: 'Read',
        toolUseId: 'read-1',
        text: '读取完成。',
      },
      { id: 'final-text-0', type: 'text', text: '不完整回复' },
      { id: 'artifact-0', type: 'artifact', title: '生成内容' },
    ];

    const staticNormalized = normalizeMessageBlocks(staticTranscriptBlocks, {
      authoritativeText: '完整最终回复',
    });
    const dynamicNormalized = normalizeMessageBlocks(dynamicCompletedBlocks, {
      authoritativeText: '完整最终回复',
    });

    expect(dynamicNormalized).toEqual(staticNormalized);
    expect(dynamicNormalized?.map((block) => block.type)).toEqual([
      'status',
      'status',
      'tool_call',
      'tool_result',
      'text',
      'artifact',
    ]);
    expect(dynamicNormalized?.[1]?.title).toBe('思考');
  });
});
