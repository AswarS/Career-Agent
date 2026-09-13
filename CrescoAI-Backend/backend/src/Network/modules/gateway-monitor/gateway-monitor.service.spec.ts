import { describe, expect, test } from 'bun:test';
import { aggregateGatewayMonitorEvents } from './gateway-monitor.service.js';

describe('GatewayMonitorService aggregation', () => {
  test('pairs requests with responses and calibrates component shares', () => {
    const timestamp = '2026-09-03T12:00:00.000Z';
    const summary = aggregateGatewayMonitorEvents([
      {
        event: 'gateway.request',
        request_id: 'request-1',
        session_id: 'session-1',
        timestamp,
        model: 'GLM-test',
        breakdown: {
          estimatedTokens: 100,
          systemTokens: 50,
          toolDefinitionTokens: 30,
          userMessageTokens: 10,
          assistantMessageTokens: 0,
          assistantToolCallTokens: 0,
          toolResultTokens: 0,
          otherTokens: 0,
          wrapperOverheadTokens: 10,
          messageCount: 2,
          toolDefinitionCount: 1,
          toolDefinitions: [{ name: 'profile_read', estimatedTokens: 30 }],
          messages: [],
        },
      },
      {
        event: 'gateway.response',
        request_id: 'request-1',
        session_id: 'session-1',
        timestamp: '2026-09-03T12:00:01.000Z',
        outcome: 'completed',
        status: 200,
        duration_ms: 1000,
        usage: {
          prompt_tokens: 200,
          completion_tokens: 20,
          total_tokens: 220,
          cached_tokens: 40,
        },
      },
    ], { range: 'all', limit: 20, now: Date.parse(timestamp) + 10_000 });

    expect(summary.totals).toMatchObject({
      requests: 1,
      completed: 1,
      promptTokens: 200,
      completionTokens: 20,
      totalTokens: 220,
      cacheHitRate: 20,
    });
    expect(summary.componentShares[0]).toMatchObject({
      key: 'system',
      tokens: 100,
      percentage: 50,
    });
    expect(summary.toolSchemas[0]).toMatchObject({
      name: 'profile_read',
      tokens: 60,
      requests: 1,
    });
    expect(summary.requests[0]).toMatchObject({
      requestId: 'request-1',
      dominantCause: 'system',
      totalTokens: 220,
    });
    expect(summary.sessions[0]).toMatchObject({
      sessionId: 'session-1',
      requests: 1,
      completed: 1,
      totalTokens: 220,
      averageTokensPerCompletedRequest: 220,
    });
  });

  test('filters requests by session and time range', () => {
    const now = Date.parse('2026-09-03T12:00:00.000Z');
    const makeRequest = (id: string, sessionId: string, timestamp: string) => ({
      event: 'gateway.request',
      request_id: id,
      session_id: sessionId,
      timestamp,
      breakdown: { estimatedTokens: 10, systemTokens: 10 },
    });
    const summary = aggregateGatewayMonitorEvents([
      makeRequest('recent', 'wanted', '2026-09-03T11:30:00.000Z'),
      makeRequest('other-session', 'other', '2026-09-03T11:40:00.000Z'),
      makeRequest('old', 'wanted', '2026-09-03T09:00:00.000Z'),
    ], { range: '1h', sessionId: 'wanted', limit: 20, now });
    expect(summary.requests.map((request) => request.requestId)).toEqual(['recent']);
  });

  test('keeps events older than 24 hours when range is all', () => {
    const summary = aggregateGatewayMonitorEvents([
      {
        event: 'gateway.request',
        request_id: 'old-request',
        session_id: 'old-session',
        timestamp: '2026-09-03T12:00:00.000Z',
        breakdown: { estimatedTokens: 10, systemTokens: 10 },
      },
    ], {
      range: 'all',
      limit: 20,
      now: Date.parse('2026-09-13T12:00:00.000Z'),
    });

    expect(summary.requests.map((request) => request.requestId)).toEqual(['old-request']);
  });

  test('keeps failed request estimates out of billed component shares', () => {
    const timestamp = '2026-09-03T12:00:00.000Z';
    const summary = aggregateGatewayMonitorEvents([
      {
        event: 'gateway.request', request_id: 'ok', timestamp,
        breakdown: { estimatedTokens: 100, systemTokens: 100 },
      },
      {
        event: 'gateway.response', request_id: 'ok', timestamp,
        outcome: 'completed', usage: { prompt_tokens: 100 },
      },
      {
        event: 'gateway.request', request_id: 'failed', timestamp,
        breakdown: { estimatedTokens: 900, toolDefinitionTokens: 900 },
      },
      {
        event: 'gateway.response', request_id: 'failed', timestamp,
        outcome: 'http_error', status: 429, usage: {},
      },
    ], { range: 'all', limit: 20, now: Date.parse(timestamp) + 1_000 });

    expect(summary.componentShares).toEqual([
      { key: 'system', label: 'System Prompt', tokens: 100, percentage: 100 },
    ]);
    expect(summary.totals).toMatchObject({
      promptTokens: 100,
      attemptedPromptTokens: 1_000,
      failedAttemptedPromptTokens: 900,
    });
    expect(summary.attemptedComponentShares[0]).toMatchObject({
      key: 'tool_definitions', tokens: 900, percentage: 90,
    });
  });

  test('groups a complete agent loop by session for ablation comparison', () => {
    const timestamp = '2026-09-03T12:00:00.000Z';
    const events = [
      ['a-1', 'session-a', 100, 10],
      ['a-2', 'session-a', 200, 20],
      ['b-1', 'session-b', 80, 8],
    ].flatMap(([requestId, sessionId, promptTokens, completionTokens]) => [
      {
        event: 'gateway.request', request_id: requestId, session_id: sessionId, timestamp,
        breakdown: { estimatedTokens: promptTokens, toolDefinitionTokens: promptTokens },
      },
      {
        event: 'gateway.response', request_id: requestId, session_id: sessionId, timestamp,
        outcome: 'completed', usage: {
          prompt_tokens: promptTokens, completion_tokens: completionTokens,
          total_tokens: Number(promptTokens) + Number(completionTokens),
        },
      },
    ]);
    const summary = aggregateGatewayMonitorEvents(
      events,
      { range: 'all', limit: 20, now: Date.parse(timestamp) + 1_000 },
    );

    expect(summary.sessions).toHaveLength(2);
    expect(summary.sessions.find((session) => session.sessionId === 'session-a')).toMatchObject({
      requests: 2,
      completed: 2,
      promptTokens: 300,
      completionTokens: 30,
      totalTokens: 330,
      averageTokensPerCompletedRequest: 165,
    });
  });
});
