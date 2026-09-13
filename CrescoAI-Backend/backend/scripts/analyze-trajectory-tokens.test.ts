import { describe, expect, test } from 'bun:test';
import {
  analyzeEvents,
  distribution,
  estimateTokens,
  normalizeUsage,
} from './analyze-trajectory-tokens.js';

describe('trajectory token analyzer', () => {
  test('normalizes provider usage including cached input', () => {
    expect(normalizeUsage({
      input_tokens: 100,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 300,
      output_tokens: 40,
    })).toEqual({
      input: 100,
      cacheCreation: 20,
      cacheRead: 300,
      output: 40,
      processedInput: 420,
      total: 460,
    });
  });

  test('estimates CJK more densely than ASCII', () => {
    expect(estimateTokens('测试测试')).toBe(4);
    expect(estimateTokens('abcdefghijklmnop')).toBe(4);
  });

  test('computes stable distributions', () => {
    expect(distribution([10, 20, 30, 40])).toMatchObject({
      count: 4,
      sum: 100,
      p50: 20,
      p90: 30,
      max: 40,
    });
  });

  test('attributes tool inputs and results', () => {
    const result = analyzeEvents('conversation', 'title', [
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', usage: { input_tokens: 10, output_tokens: 5 }, content: [
        { type: 'tool_use', id: 't1', name: 'profile_read', input: { source: 'product' } },
      ] } },
      { type: 'user', uuid: 'u1', message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'profile data' },
      ] } },
    ]);
    expect(result.trajectory.total).toBe(15);
    expect(result.trajectory.payloadByCategory['tool_input:profile_read']).toBeGreaterThan(0);
    expect(result.trajectory.payloadByCategory['tool_result:profile_read']).toBeGreaterThan(0);
  });
});
