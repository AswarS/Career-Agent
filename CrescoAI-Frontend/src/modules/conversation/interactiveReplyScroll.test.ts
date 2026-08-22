import { describe, expect, it } from 'vitest';
import type { ThreadMessage } from '../../types/entities';
import { findInteractiveReplyBoundary } from './interactiveReplyScroll';

function createMessage(
  id: string,
  blocks: ThreadMessage['blocks'],
  content = '',
): ThreadMessage {
  return {
    id,
    threadId: 'thread-1',
    role: 'assistant',
    kind: 'markdown',
    content,
    blocks,
    createdAt: '2026-08-07T00:00:00.000Z',
  };
}

describe('findInteractiveReplyBoundary', () => {
  it('targets the first renderable message after the ask question', () => {
    const boundary = findInteractiveReplyBoundary([
      createMessage('assistant-question', [{
        id: 'ask-1',
        type: 'ask_question',
        toolUseId: 'tool-1',
      }]),
      createMessage('assistant-follow-up', [{
        id: 'text-1',
        type: 'text',
        text: '已根据你的回答继续处理。',
      }]),
    ], 'tool-1');

    expect(boundary).toEqual({
      questionMessageId: 'assistant-question',
      continuationMessageId: 'assistant-follow-up',
    });
  });

  it('falls back to the question card when the continuation is in the same message', () => {
    const boundary = findInteractiveReplyBoundary([
      createMessage('assistant-question', [
        { id: 'ask-1', type: 'ask_question', toolUseId: 'tool-1' },
        { id: 'text-1', type: 'text', text: '已根据你的回答继续处理。' },
      ]),
    ], 'tool-1');

    expect(boundary).toEqual({
      questionMessageId: 'assistant-question',
      continuationMessageId: null,
    });
  });

  it('ignores unrelated tool ids', () => {
    expect(findInteractiveReplyBoundary([
      createMessage('assistant-question', [{
        id: 'ask-1',
        type: 'ask_question',
        toolUseId: 'tool-1',
      }]),
    ], 'tool-other')).toBeNull();
  });
});
