export type ToolExpectation = {
  schemaVersion: 'career-agent.private-tool-expectations.v1';
  taskId: string;
  expectedTools: string[];
};

export type ToolSemanticAudit = {
  schemaVersion: 'career-agent.tool-semantic-audit.v1';
  accepted: boolean;
  expectedCallCount: number;
  matchedCallCount: number;
  missingCallCount: number;
  orderValid: boolean;
  issues: string[];
};

export function validateToolExpectation(value: unknown, taskId: string): ToolExpectation {
  const input = value as Partial<ToolExpectation> | null;
  if (!input || input.schemaVersion !== 'career-agent.private-tool-expectations.v1') {
    throw new Error('Invalid private tool expectation schema');
  }
  if (input.taskId !== taskId) throw new Error('Private tool expectation task mismatch');
  if (!Array.isArray(input.expectedTools) || input.expectedTools.some(name => typeof name !== 'string' || !name)) {
    throw new Error('Private tool expectations must contain non-empty tool names');
  }
  return input as ToolExpectation;
}

export function auditExpectedToolCalls(expectedTools: string[], actualTools: string[]): ToolSemanticAudit {
  let cursor = 0;
  let matchedCallCount = 0;
  for (const actual of actualTools) {
    if (actual === expectedTools[cursor]) {
      cursor += 1;
      matchedCallCount += 1;
    }
  }

  const expectedCounts = new Map<string, number>();
  const actualCounts = new Map<string, number>();
  for (const name of expectedTools) expectedCounts.set(name, (expectedCounts.get(name) ?? 0) + 1);
  for (const name of actualTools) actualCounts.set(name, (actualCounts.get(name) ?? 0) + 1);
  const missingCallCount = [...expectedCounts].reduce(
    (total, [name, count]) => total + Math.max(0, count - (actualCounts.get(name) ?? 0)),
    0,
  );
  const orderValid = cursor === expectedTools.length;
  const issues = [
    ...(missingCallCount ? ['expected_tool_calls_missing'] : []),
    ...(!missingCallCount && !orderValid ? ['expected_tool_order_mismatch'] : []),
  ];
  return {
    schemaVersion: 'career-agent.tool-semantic-audit.v1',
    accepted: issues.length === 0,
    expectedCallCount: expectedTools.length,
    matchedCallCount,
    missingCallCount,
    orderValid,
    issues,
  };
}

function hasFailedOutcome(value: unknown, depth = 0): boolean {
  if (depth > 16) return true;
  if (typeof value === 'string') {
    try { return hasFailedOutcome(JSON.parse(value), depth + 1); } catch { return false; }
  }
  if (Array.isArray(value)) return value.some(item => hasFailedOutcome(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const object = value as Record<string, unknown>;
  if (object.outcome === 'error' || object.outcome === 'insufficient_input' || object.outcome === 'partial') return true;
  return Object.values(object).some(item => hasFailedOutcome(item, depth + 1));
}

/** Required workflows must succeed, not merely emit the right tool names. */
export function auditExpectedToolResults(expectedTools: string[], events: Array<{ payload: any }>): ToolSemanticAudit {
  const calls = events.map(e => e.payload).filter(p => p?.type === 'tool.call');
  const results = new Map<string, any[]>();
  for (const { payload: p } of events) {
    if (p?.type === 'tool.result') results.set(p.toolUseId, [...(results.get(p.toolUseId) ?? []), p]);
  }
  const audit = auditExpectedToolCalls(expectedTools, calls.map(p => p.name));
  const successful = calls.filter(call => {
    const paired = results.get(call.toolUseId) ?? [];
    return paired.length === 1 && paired[0].isError === false && !hasFailedOutcome(paired[0].content);
  }).map(call => call.name);
  if (!auditExpectedToolCalls(expectedTools, successful).accepted) {
    audit.accepted = false;
    audit.issues.push('expected_tool_results_unsuccessful');
  }
  return audit;
}
