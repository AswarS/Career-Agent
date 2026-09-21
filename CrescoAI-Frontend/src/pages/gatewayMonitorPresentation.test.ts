import { describe, expect, test } from 'vitest';
import {
  compositionBackground,
  formatDeltaPercent,
  formatDuration,
  formatTokens,
} from './gatewayMonitorPresentation';

describe('gateway monitor presentation', () => {
  test('builds a composition gradient from the latest component shares', () => {
    expect(compositionBackground([
      { key: 'system', label: 'System', tokens: 60, percentage: 60 },
      { key: 'tool_results', label: 'Tools', tokens: 40, percentage: 40 },
    ])).toBe('conic-gradient(#315f58 0% 60%,#a95550 60% 100%)');
  });

  test('uses an empty background when no positive share exists', () => {
    expect(compositionBackground([])).toBe('#e5e7eb');
    expect(compositionBackground([
      { key: 'system', label: 'System', tokens: 0, percentage: 0 },
    ])).toBe('#e5e7eb');
  });

  test('formats dashboard values consistently', () => {
    expect(formatTokens(1_250)).toBe('1.3k');
    expect(formatDuration(1_250)).toBe('1.3s');
    expect(formatDeltaPercent(100, 75)).toBe('-25.0%');
  });
});
