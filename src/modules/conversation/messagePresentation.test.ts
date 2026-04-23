import { describe, expect, it } from 'vitest';
import { getPresentedMessageContent, shouldUseMultiAgentPresentation } from './messagePresentation';
import type { ThreadMessage } from '../../types/entities';

function createMessage(overrides: Partial<ThreadMessage>): ThreadMessage {
  return {
    id: 'message-001',
    threadId: 'thread-001',
    role: 'assistant',
    kind: 'markdown',
    content: '默认内容',
    createdAt: '2026-04-10 12:30',
    ...overrides,
  };
}

describe('getPresentedMessageContent', () => {
  it('extracts inline think blocks for assistant messages when explicit reasoning is absent', () => {
    const presented = getPresentedMessageContent(createMessage({
      content: '<think>先拆解用户真实意图。</think>\n\n给你一版收紧后的建议。',
    }));

    expect(presented.reasoning).toBe('先拆解用户真实意图。');
    expect(presented.content).toBe('给你一版收紧后的建议。');
  });

  it('preserves literal think tags for non-assistant messages', () => {
    const presented = getPresentedMessageContent(createMessage({
      role: 'user',
      content: '请保留这段字面量：<think>debug</think>',
    }));

    expect(presented.reasoning).toBeNull();
    expect(presented.content).toBe('请保留这段字面量：<think>debug</think>');
  });

  it('prefers explicit reasoning without rewriting the visible content', () => {
    const presented = getPresentedMessageContent(createMessage({
      reasoning: '这是显式 reasoning。',
      content: '这是可见回复。',
    }));

    expect(presented.reasoning).toBe('这是显式 reasoning。');
    expect(presented.content).toBe('这是可见回复。');
  });

  it('drops empty or placeholder reasoning values', () => {
    const emptyPresented = getPresentedMessageContent(createMessage({
      reasoning: '   ',
      content: '这是可见回复。',
    }));
    const errorPresented = getPresentedMessageContent(createMessage({
      reasoning: 'error',
      content: '这是可见回复。',
    }));

    expect(emptyPresented.reasoning).toBeNull();
    expect(errorPresented.reasoning).toBeNull();
  });
});

describe('shouldUseMultiAgentPresentation', () => {
  it('returns false when only one assistant identity exists in the thread', () => {
    const messages = [
      createMessage({ agentId: 'agent-direction', agentName: '方向助手' }),
      createMessage({ id: 'message-002', content: '第二条消息', agentId: 'agent-direction', agentName: '方向助手' }),
    ];

    expect(shouldUseMultiAgentPresentation(messages)).toBe(false);
  });

  it('returns true when multiple assistant identities exist in the same thread', () => {
    const messages = [
      createMessage({ agentId: 'agent-planner', agentName: '规划助手' }),
      createMessage({ id: 'message-002', agentId: 'agent-execution', agentName: '执行助手' }),
    ];

    expect(shouldUseMultiAgentPresentation(messages)).toBe(true);
  });
});
