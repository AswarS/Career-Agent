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
