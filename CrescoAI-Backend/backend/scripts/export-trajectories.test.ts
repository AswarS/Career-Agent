import { describe, expect, test } from 'bun:test';
import {
  buildSftMessages,
  sanitizeTrajectoryValue,
  selectLatestBranch,
} from './export-trajectories.js';

describe('trajectory exporter', () => {
  test('selects the latest transcript branch', () => {
    const events = [
      { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'hello' } },
      { type: 'assistant', uuid: 'a-old', parentUuid: 'u1', timestamp: '2026-01-01T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'old' }] } },
      { type: 'assistant', uuid: 'a-new', parentUuid: 'u1', timestamp: '2026-01-01T00:00:02Z', message: { role: 'assistant', content: [{ type: 'text', text: 'new' }] } },
    ];
    expect(selectLatestBranch(events).map((event) => event.uuid)).toEqual(['u1', 'a-new']);
  });

  test('converts tool calls and results without private thinking', () => {
    const events = [
      { type: 'user', message: { role: 'user', content: '生成简历' } },
      { type: 'assistant', message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'private' },
        { type: 'tool_use', id: 't1', name: 'profile_read', input: { source: 'product' } },
      ] } },
      { type: 'user', toolUseResult: {}, message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'profile' },
      ] } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '完成' }] } },
    ];
    const result = buildSftMessages(events);
    expect(result.messages).toEqual([
      { role: 'user', content: '生成简历' },
      { role: 'assistant', content: null, tool_calls: [{
        id: 't1',
        type: 'function',
        function: { name: 'profile_read', arguments: '{"source":"product"}' },
      }] },
      { role: 'tool', tool_call_id: 't1', name: 'profile_read', content: 'profile' },
      { role: 'assistant', content: '完成' },
    ]);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  test('redacts secret fields and inline bearer tokens', () => {
    expect(sanitizeTrajectoryValue({
      api_key: 'secret-value',
      note: 'Authorization: Bearer abc.def',
      payload: '{"api_key":"nested-secret"}',
      reasoning: 'private',
    })).toEqual({
      api_key: '[REDACTED]',
      note: 'Authorization: Bearer [REDACTED]',
      payload: '{"api_key":"[REDACTED]"}',
    });
  });
});
