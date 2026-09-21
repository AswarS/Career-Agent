import type { MonitorSession, TokenComponent } from '../services/gatewayMonitorClient';

const COMPONENT_COLORS: Record<string, string> = {
  system: '#315f58',
  tool_definitions: '#5f8f86',
  user_messages: '#9a846c',
  assistant_history: '#766b87',
  assistant_tool_calls: '#b3834c',
  tool_results: '#a95550',
  other: '#80858b',
  wrapper_overhead: '#b8b3aa',
};

const COMPONENT_LABELS: Record<string, string> = {
  system: 'System Prompt',
  tool_definitions: '工具 Schema',
  user_messages: '用户与框架消息',
  assistant_history: '助手历史',
  assistant_tool_calls: '工具调用',
  tool_results: '工具结果',
  other: '其他',
  wrapper_overhead: '协议开销',
  unknown: '等待数据',
};

export function componentColor(key: string): string {
  return COMPONENT_COLORS[key] ?? COMPONENT_COLORS.other;
}

export function componentLabel(key: string): string {
  return COMPONENT_LABELS[key] ?? key;
}

export function formatTokens(value = 0): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatDuration(value = 0): string {
  if (!value) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

export function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function shortId(value: string | null): string {
  return value?.slice(0, 8) ?? '—';
}

export function sessionComponentTokens(session: MonitorSession | undefined, key: string): number {
  return session?.componentShares.find((item) => item.key === key)?.tokens ?? 0;
}

export function formatDeltaPercent(baseline: number, candidate: number): string {
  if (!baseline) return candidate ? '新增' : '—';
  const value = ((candidate - baseline) / baseline) * 100;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function compositionBackground(components: TokenComponent[]): string {
  let cursor = 0;
  const stops = components
    .filter((item) => item.percentage > 0)
    .map((item) => {
      const start = cursor;
      cursor += item.percentage;
      return `${componentColor(item.key)} ${start}% ${cursor}%`;
    });
  return stops.length ? `conic-gradient(${stops.join(',')})` : '#e5e7eb';
}
