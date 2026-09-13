import { Injectable } from '@nestjs/common';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type MonitorEvent = Record<string, any>;

const componentDefinitions = [
  ['system', 'System Prompt', 'systemTokens'],
  ['tool_definitions', 'Tool Schemas', 'toolDefinitionTokens'],
  ['user_messages', 'User Messages', 'userMessageTokens'],
  ['assistant_history', 'Assistant History', 'assistantMessageTokens'],
  ['assistant_tool_calls', 'Tool Calls', 'assistantToolCallTokens'],
  ['tool_results', 'Tool Results', 'toolResultTokens'],
  ['other', 'Other', 'otherTokens'],
  ['wrapper_overhead', 'Protocol Overhead', 'wrapperOverheadTokens'],
] as const;

const rangeDurations: Record<string, number | null> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: null,
};

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function monitorEnabled(): boolean {
  return /^(?:1|true|yes|on)$/i.test(
    process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED?.trim() ?? '',
  );
}

function monitorRoot(): string {
  return resolve(
    process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR?.trim()
      || join(process.cwd(), 'data', 'gateway-monitor'),
  );
}

function safeUserId(userId: number): string {
  return String(userId).replace(/[^A-Za-z0-9_-]/g, '_');
}

function bucketTimestamp(timestamp: string, range: string): string {
  const date = new Date(timestamp);
  if (range === '1h' || range === '24h') {
    date.setUTCMinutes(0, 0, 0);
  } else {
    date.setUTCHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

function componentSharesFromTotals(totals: Map<string, number>) {
  const totalTokens = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return componentDefinitions.map(([key, label]) => {
    const tokens = totals.get(key) ?? 0;
    return {
      key,
      label,
      tokens,
      percentage: totalTokens > 0
        ? Number(((tokens / totalTokens) * 100).toFixed(2))
        : 0,
    };
  }).filter((item) => item.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens);
}

export interface GatewayMonitorQuery {
  range?: string;
  sessionId?: string;
  limit?: number;
}

export function aggregateGatewayMonitorEvents(
  events: MonitorEvent[],
  input: { range: string; sessionId?: string; limit: number; now?: number },
) {
  const now = input.now ?? Date.now();
  // `all` intentionally maps to null (no cutoff). Nullish coalescing would
  // mistake that valid value for a missing range and silently apply 24h.
  const duration = Object.hasOwn(rangeDurations, input.range)
    ? rangeDurations[input.range]
    : rangeDurations['24h'];
  const cutoff = duration === null ? null : now - duration;
  const requests = new Map<string, MonitorEvent>();
  const responses = new Map<string, MonitorEvent>();

  for (const event of events) {
    if (typeof event.request_id !== 'string') continue;
    if (input.sessionId && event.session_id !== input.sessionId) continue;
    const time = Date.parse(String(event.timestamp ?? ''));
    if (cutoff !== null && (!Number.isFinite(time) || time < cutoff)) continue;
    if (event.event === 'gateway.request') requests.set(event.request_id, event);
    if (event.event === 'gateway.response') responses.set(event.request_id, event);
  }

  const componentTotals = new Map<string, number>();
  const attemptedComponentTotals = new Map<string, number>();
  const toolTotals = new Map<string, { tokens: number; requests: number }>();
  const trend = new Map<string, {
    bucket: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>();

  const rows = [...requests.values()].map((request) => {
    const response = responses.get(request.request_id);
    const breakdown = request.breakdown ?? {};
    const promptTokens = numberValue(response?.usage?.prompt_tokens);
    const completionTokens = numberValue(response?.usage?.completion_tokens);
    const totalTokens = numberValue(response?.usage?.total_tokens)
      || promptTokens + completionTokens;
    const estimatedPromptTokens = numberValue(breakdown.estimatedTokens);
    const calibration = promptTokens > 0 && estimatedPromptTokens > 0
      ? promptTokens / estimatedPromptTokens
      : 1;
    const hasActualUsage = promptTokens > 0;
    const components = componentDefinitions.map(([key, label, field]) => {
      const estimatedTokens = numberValue(breakdown[field]);
      const calibratedTokens = Math.round(estimatedTokens * calibration);
      attemptedComponentTotals.set(
        key,
        (attemptedComponentTotals.get(key) ?? 0) + estimatedTokens,
      );
      if (hasActualUsage) {
        componentTotals.set(key, (componentTotals.get(key) ?? 0) + calibratedTokens);
      }
      return { key, label, estimatedTokens, calibratedTokens, percentage: 0 };
    }).sort((left, right) => right.calibratedTokens - left.calibratedTokens);
    const componentSum = components.reduce((sum, component) => sum + component.calibratedTokens, 0);
    components.forEach((component) => {
      component.percentage = componentSum > 0
        ? Number(((component.calibratedTokens / componentSum) * 100).toFixed(2))
        : 0;
    });

    for (const tool of Array.isArray(breakdown.toolDefinitions) ? breakdown.toolDefinitions : []) {
      if (typeof tool?.name !== 'string') continue;
      if (hasActualUsage) {
        const current = toolTotals.get(tool.name) ?? { tokens: 0, requests: 0 };
        current.tokens += Math.round(numberValue(tool.estimatedTokens) * calibration);
        current.requests += 1;
        toolTotals.set(tool.name, current);
      }
    }

    const timestamp = String(request.timestamp ?? '');
    if (Number.isFinite(Date.parse(timestamp))) {
      const bucket = bucketTimestamp(timestamp, input.range);
      const current = trend.get(bucket) ?? {
        bucket,
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };
      current.requests += 1;
      current.promptTokens += promptTokens;
      current.completionTokens += completionTokens;
      current.totalTokens += totalTokens;
      trend.set(bucket, current);
    }

    return {
      requestId: request.request_id,
      sessionId: request.session_id ?? null,
      timestamp: request.timestamp ?? null,
      model: request.model ?? null,
      gatewayHost: request.gateway_host ?? null,
      stream: request.stream === true,
      outcome: response?.outcome ?? 'pending',
      status: response?.status ?? null,
      durationMs: numberValue(response?.duration_ms),
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens: numberValue(response?.usage?.cached_tokens),
      reasoningTokens: numberValue(response?.usage?.reasoning_tokens),
      estimatedPromptTokens,
      estimateRatio: promptTokens > 0
        ? Number((estimatedPromptTokens / promptTokens).toFixed(4))
        : null,
      dominantCause: components[0]?.key ?? 'unknown',
      messageCount: numberValue(breakdown.messageCount),
      toolDefinitionCount: numberValue(breakdown.toolDefinitionCount),
      components,
      largestMessages: breakdown.messages ?? [],
      largestToolDefinitions: breakdown.toolDefinitions ?? [],
    };
  }).sort((left, right) => {
    const leftValue = left.totalTokens || left.estimatedPromptTokens;
    const rightValue = right.totalTokens || right.estimatedPromptTokens;
    return rightValue - leftValue;
  });

  const componentShares = componentSharesFromTotals(componentTotals);
  const attemptedComponentShares = componentSharesFromTotals(attemptedComponentTotals);
  const toolSchemas = [...toolTotals.entries()]
    .map(([name, value]) => ({
      name,
      tokens: value.tokens,
      requests: value.requests,
      averageTokens: value.requests ? Math.round(value.tokens / value.requests) : 0,
    }))
    .sort((left, right) => right.tokens - left.tokens)
    .slice(0, 30);
  const totals = rows.reduce((result, row) => {
    result.requests += 1;
    result.completed += row.outcome === 'completed' ? 1 : 0;
    result.failed += row.outcome !== 'completed' && row.outcome !== 'pending' ? 1 : 0;
    result.pending += row.outcome === 'pending' ? 1 : 0;
    result.promptTokens += row.promptTokens;
    result.completionTokens += row.completionTokens;
    result.totalTokens += row.totalTokens;
    result.cachedTokens += row.cachedTokens;
    result.attemptedPromptTokens += row.estimatedPromptTokens;
    if (row.outcome !== 'completed' && row.outcome !== 'pending') {
      result.failedAttemptedPromptTokens += row.estimatedPromptTokens;
    }
    result.durationMs += row.durationMs;
    return result;
  }, {
    requests: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    attemptedPromptTokens: 0,
    failedAttemptedPromptTokens: 0,
    durationMs: 0,
  });

  const sessionAccumulators = new Map<string, {
    sessionId: string;
    firstAt: string | null;
    lastAt: string | null;
    requests: number;
    completed: number;
    failed: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    attemptedPromptTokens: number;
    failedAttemptedPromptTokens: number;
    durationMs: number;
    componentTotals: Map<string, number>;
    attemptedComponentTotals: Map<string, number>;
  }>();
  for (const row of rows) {
    const sessionId = row.sessionId ?? 'unattributed';
    const current = sessionAccumulators.get(sessionId) ?? {
      sessionId,
      firstAt: null,
      lastAt: null,
      requests: 0,
      completed: 0,
      failed: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      attemptedPromptTokens: 0,
      failedAttemptedPromptTokens: 0,
      durationMs: 0,
      componentTotals: new Map<string, number>(),
      attemptedComponentTotals: new Map<string, number>(),
    };
    const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
    if (timestamp) {
      if (!current.firstAt || timestamp < current.firstAt) current.firstAt = timestamp;
      if (!current.lastAt || timestamp > current.lastAt) current.lastAt = timestamp;
    }
    current.requests += 1;
    current.completed += row.outcome === 'completed' ? 1 : 0;
    current.failed += row.outcome !== 'completed' && row.outcome !== 'pending' ? 1 : 0;
    current.promptTokens += row.promptTokens;
    current.completionTokens += row.completionTokens;
    current.totalTokens += row.totalTokens;
    current.cachedTokens += row.cachedTokens;
    current.attemptedPromptTokens += row.estimatedPromptTokens;
    current.durationMs += row.durationMs;
    if (row.outcome !== 'completed' && row.outcome !== 'pending') {
      current.failedAttemptedPromptTokens += row.estimatedPromptTokens;
    }
    for (const component of row.components) {
      current.attemptedComponentTotals.set(
        component.key,
        (current.attemptedComponentTotals.get(component.key) ?? 0) + component.estimatedTokens,
      );
      if (row.promptTokens > 0) {
        current.componentTotals.set(
          component.key,
          (current.componentTotals.get(component.key) ?? 0) + component.calibratedTokens,
        );
      }
    }
    sessionAccumulators.set(sessionId, current);
  }
  const sessions = [...sessionAccumulators.values()].map((session) => ({
    sessionId: session.sessionId,
    firstAt: session.firstAt,
    lastAt: session.lastAt,
    requests: session.requests,
    completed: session.completed,
    failed: session.failed,
    promptTokens: session.promptTokens,
    completionTokens: session.completionTokens,
    totalTokens: session.totalTokens,
    cachedTokens: session.cachedTokens,
    attemptedPromptTokens: session.attemptedPromptTokens,
    failedAttemptedPromptTokens: session.failedAttemptedPromptTokens,
    averageTokensPerCompletedRequest: session.completed
      ? Math.round(session.totalTokens / session.completed)
      : 0,
    averageDurationMs: session.requests
      ? Math.round(session.durationMs / session.requests)
      : 0,
    componentShares: componentSharesFromTotals(session.componentTotals),
    attemptedComponentShares: componentSharesFromTotals(session.attemptedComponentTotals),
  })).sort((left, right) => String(right.lastAt ?? '').localeCompare(String(left.lastAt ?? '')));

  return {
    generatedAt: new Date(now).toISOString(),
    range: input.range,
    totals: {
      ...totals,
      averageDurationMs: totals.requests ? Math.round(totals.durationMs / totals.requests) : 0,
      cacheHitRate: totals.promptTokens
        ? Number(((totals.cachedTokens / totals.promptTokens) * 100).toFixed(2))
        : 0,
    },
    componentShares,
    attemptedComponentShares,
    trend: [...trend.values()].sort((left, right) => left.bucket.localeCompare(right.bucket)),
    toolSchemas,
    sessions,
    requests: rows.slice(0, input.limit),
  };
}

@Injectable()
export class GatewayMonitorService {
  async summary(userId: number, query: GatewayMonitorQuery) {
    const range = Object.hasOwn(rangeDurations, query.range ?? '') ? query.range! : '24h';
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const events = await this.readUserEvents(userId);
    return {
      enabled: monitorEnabled(),
      ...aggregateGatewayMonitorEvents(events, {
        range,
        sessionId: query.sessionId?.trim() || undefined,
        limit,
      }),
    };
  }

  private async readUserEvents(userId: number): Promise<MonitorEvent[]> {
    const root = monitorRoot();
    const prefix = `gateway-usage-${safeUserId(userId)}-`;
    const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    });
    const events: MonitorEvent[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith('.jsonl')) continue;
      const source = await readFile(join(root, entry.name), 'utf8');
      for (const line of source.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as MonitorEvent;
          if (String(event.user_id ?? '') === String(userId)) events.push(event);
        } catch {
          // A partially written final line must not make the dashboard unavailable.
        }
      }
    }
    return events;
  }
}
