import { describe, expect, test } from 'bun:test'
import {
  accumulateStreamEvents,
  createStreamAccumulator,
} from '../src/cli/transports/ccrClient.js'

function streamEvent(event: Record<string, unknown>) {
  return {
    type: 'stream_event' as const,
    uuid: crypto.randomUUID(),
    session_id: 'session-1',
    parent_tool_use_id: null,
    event,
  }
}

describe('CCR stream prefix accumulation', () => {
  test('seeds a text block from message_start before appending deltas', () => {
    const state = createStreamAccumulator()
    const output = accumulateStreamEvents([
      streamEvent({
        type: 'message_start',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: '{' }],
        },
      }),
      streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }),
      streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: '"ok":true}' },
      }),
    ] as any, state)

    const deltaEvent = output.find((entry) => (
      entry.type === 'stream_event'
      && (entry as any).event?.type === 'content_block_delta'
    )) as any
    expect(deltaEvent.event.delta.text).toBe('{"ok":true}')
  })

  test('does not duplicate a prefix repeated by content_block_start', () => {
    const state = createStreamAccumulator()
    const output = accumulateStreamEvents([
      streamEvent({
        type: 'message_start',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: '{' }],
        },
      }),
      streamEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '{"ok"' },
      }),
      streamEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ':true}' },
      }),
    ] as any, state)

    const deltaEvent = output.find((entry) => (
      entry.type === 'stream_event'
      && (entry as any).event?.type === 'content_block_delta'
    )) as any
    expect(deltaEvent.event.delta.text).toBe('{"ok":true}')
  })
})
