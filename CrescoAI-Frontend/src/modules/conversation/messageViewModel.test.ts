import { describe, expect, it } from 'vitest';
import type { ThreadMessage } from '../../types/entities';
import {
  canDownloadFile,
  createBlocksFromLegacyReasoning,
  createMessageViewModel,
} from './messageViewModel';

function createMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'message-001',
    threadId: 'thread-001',
    role: 'assistant',
    kind: 'markdown',
    content: '最终答复。',
    createdAt: '2026-04-10 12:30',
    ...overrides,
  };
}

describe('createBlocksFromLegacyReasoning', () => {
  it('converts marker-based legacy reasoning into timeline blocks', () => {
    const blocks = createBlocksFromLegacyReasoning([
      '先判断任务。',
      '',
      '[工具调用]',
      '{"name":"Read","input":{"file_path":"C:\\\\Users\\\\demo\\\\secret.txt"}}',
      '',
      '[工具返回]',
      '读取完成。',
      '',
      '[过程事件]',
      '继续整理结果。',
    ].join('\n'));

    expect(blocks.map((block) => block.type)).toEqual([
      'status',
      'tool_call',
      'tool_result',
      'status',
    ]);
    expect(blocks[0]?.text).toBe('先判断任务。');
    expect(blocks[1]?.text).toBe('正在调用工具。');
    expect(blocks[2]?.text).toBe('读取完成。');
    expect(blocks[3]?.text).toBe('继续整理结果。');
  });
});

describe('createMessageViewModel', () => {
  it('prefers canonical message blocks over legacy reasoning text', () => {
    const viewModel = createMessageViewModel(createMessage({
      reasoning: '[工具返回]\n这段 fallback 不应该优先展示。',
      blocks: [
        { id: 'status-0', type: 'status', title: '过程', text: '先确认数据来源。' },
        {
          id: 'tool-call-read',
          type: 'tool_call',
          title: '工具调用 · Read',
          name: 'Read',
          text: '正在调用 Read。',
        },
        {
          id: 'tool-result-read',
          type: 'tool_result',
          title: '工具返回 · Read',
          name: 'Read',
          text: '读取完成。',
        },
        { id: 'text-0', type: 'text', text: '最终答复。' },
      ],
    }));

    expect(viewModel.blocks.map((block) => block.type)).toEqual([
      'status',
      'tool_call',
      'tool_result',
      'text',
    ]);
    expect(viewModel.blocks[0]?.title).toBe('思考');
    expect(viewModel.blocks[0]?.text).toBe('先确认数据来源。');
    expect(viewModel.blocks[1]?.title).toBe('工具调用 · Read');
    expect(viewModel.blocks[1]?.text).toBe('正在调用 Read。');
    expect(viewModel.blocks[1]?.text).not.toContain('secret.txt');
    expect(viewModel.blocks[2]?.title).toBe('工具返回 · Read');
    expect(viewModel.blocks[2]?.text).toBe('读取完成。');
    expect(viewModel.blocks[3]?.text).toBe('最终答复。');
    expect(viewModel.content).toBe('最终答复。');
  });

  it('groups static execution blocks and replaces internal skill content with a loaded notice', () => {
    const viewModel = createMessageViewModel(createMessage({
      content: 'Final answer',
      blocks: [
        { id: 'skill-0', type: 'skill', name: 'learning-plan', text: 'Skill command selected: /learning-plan.' },
        { id: 'status-0', type: 'status', text: 'Preparing tool call' },
        { id: 'tool-call-1', type: 'tool_call', name: 'Read', toolUseId: 'tool-1', text: 'Calling Read' },
        { id: 'tool-result-1', type: 'tool_result', name: 'Read', toolUseId: 'tool-1', text: 'Read result' },
        { id: 'text-0', type: 'text', text: 'Final answer' },
      ],
    }));

    expect(viewModel.blocks.map((block) => block.id)).toEqual([
      'skill-loaded-learning-plan',
      'status-0',
      'tool-call-1',
      'tool-result-1',
      'text-0',
    ]);
    expect(viewModel.finalBlocks.map((block) => block.id)).toEqual(['text-0']);
    expect(viewModel.executionBlocks.map((block) => block.id)).toEqual([
      'skill-loaded-learning-plan',
      'status-0',
      'tool-call-1',
    ]);
    expect(viewModel.executionBlocks[2]?.resultBlocks?.map((block) => block.id)).toEqual(['tool-result-1']);
    expect(viewModel.hasHiddenExecutionBlocks).toBe(true);
    expect(viewModel.hiddenExecutionBlockCount).toBe(3);
    expect(viewModel.executionBlocks[0]?.text).toBe('Skill learning-plan loaded');
  });

  it('falls back to message content when canonical blocks contain execution only', () => {
    const viewModel = createMessageViewModel(createMessage({
      content: 'Authoritative final reply',
      blocks: [
        { id: 'status-0', type: 'status', text: 'Execution detail' },
        { id: 'tool-call-0', type: 'tool_call', name: 'Read', text: 'Calling Read' },
      ],
    }));

    expect(viewModel.finalBlocks).toHaveLength(1);
    expect(viewModel.finalBlocks[0]?.type).toBe('text');
    expect(viewModel.finalBlocks[0]?.text).toBe('Authoritative final reply');
  });

  it('keeps interactive AskUserQuestion blocks visible instead of hiding them with execution details', () => {
    const viewModel = createMessageViewModel(createMessage({
      content: '',
      streaming: true,
      blocks: [{
        id: 'ask-question-tool-1',
        type: 'ask_question',
        title: '需要你的选择',
        toolUseId: 'tool-1',
        status: 'pending',
        questions: [{
          header: '职业方向',
          question: '你希望优先探索哪条职业路径？',
          multiSelect: true,
          options: [
            { label: '产品经理', description: '探索产品规划与协作。' },
            { label: '数据分析', description: '探索数据驱动决策。' },
          ],
        }],
      }],
    }));

    expect(viewModel.askQuestionBlocks).toHaveLength(1);
    expect(viewModel.replyUnits[0]?.askQuestionBlocks[0]).toMatchObject({
      id: 'ask-question-tool-1',
      toolUseId: 'tool-1',
      status: 'pending',
    });
    expect(viewModel.hasHiddenExecutionBlocks).toBe(false);
  });

  it('keeps each AskUserQuestion in its original reply unit when one message streams multiple rounds', () => {
    const viewModel = createMessageViewModel(createMessage({
      content: '',
      streaming: true,
      blocks: [
        { id: 'text-1', type: 'text', text: '第一段回复。' },
        { id: 'ask-1', type: 'ask_question', toolUseId: 'tool-1', questions: [] },
        { id: 'result-1', type: 'tool_result', toolUseId: 'tool-1', text: '第一轮已回答。' },
        { id: 'text-2', type: 'text', text: '第二段回复。' },
        { id: 'ask-2', type: 'ask_question', toolUseId: 'tool-2', questions: [] },
        { id: 'result-2', type: 'tool_result', toolUseId: 'tool-2', text: '第二轮已回答。' },
        { id: 'text-3', type: 'text', text: '第三段回复。' },
        { id: 'ask-3', type: 'ask_question', toolUseId: 'tool-3', questions: [] },
      ],
    }));

    expect(viewModel.replyUnits.map((unit) => ({
      text: unit.textBlock?.text ?? null,
      questions: unit.askQuestionBlocks.map((block) => block.toolUseId),
    }))).toEqual([
      { text: '第一段回复。', questions: ['tool-1'] },
      { text: '第二段回复。', questions: ['tool-2'] },
      { text: '第三段回复。', questions: ['tool-3'] },
    ]);
  });

  it('keeps inline think fallback as a status block for legacy streaming messages', () => {
    const viewModel = createMessageViewModel(createMessage({
      content: '<think>先组织答案。</think>\n\n这里是正文。',
    }));

    expect(viewModel.blocks.map((block) => block.type)).toEqual(['status', 'text']);
    expect(viewModel.blocks[0]?.text).toBe('先组织答案。');
    expect(viewModel.blocks[1]?.text).toBe('这里是正文。');
    expect(viewModel.content).toBe('这里是正文。');
  });

  it('formats speaker metadata, runtime metadata, and artifact block display fields', () => {
    const viewModel = createMessageViewModel(createMessage({
      agentName: '规划助手',
      agentAccent: 'amber',
      model: 'claude-sonnet-4',
      usage: { input_tokens: 7, output_tokens: 11 },
      media: [{
        id: 'media-001',
        kind: 'image',
        url: '/assets/chart.png',
        title: '分析图',
      }],
      files: [{
        id: 'file-001',
        name: 'report.pdf',
        url: '/downloads/report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      }],
    }), {
      multiAgentMode: true,
    });

    const artifactBlock = viewModel.blocks.find((block) => block.type === 'artifact');
    expect(viewModel.speakerName).toBe('规划助手');
    expect(viewModel.speakerMeta).toBe('助手');
    expect(viewModel.accentClass).toBe('agent-amber');
    expect(viewModel.runtimeMetaLabel).toBe('claude-sonnet-4 · 18 tokens');
    expect(artifactBlock?.media[0]?.altText).toBe('分析图');
    expect(artifactBlock?.files[0]?.canDownload).toBe(true);
    expect(artifactBlock?.files[0]?.displayType).toBe('PDF');
    expect(artifactBlock?.files[0]?.displaySize).toBe('2.0 KB');
  });
});

describe('canDownloadFile', () => {
  it('allows local, blob, http, and https URLs only', () => {
    expect(canDownloadFile('/downloads/report.pdf')).toBe(true);
    expect(canDownloadFile('blob:http://localhost/report')).toBe(true);
    expect(canDownloadFile('https://example.test/report.pdf')).toBe(true);
    expect(canDownloadFile('//example.test/report.pdf')).toBe(false);
    expect(canDownloadFile('javascript:alert(1)')).toBe(false);
  });
});
