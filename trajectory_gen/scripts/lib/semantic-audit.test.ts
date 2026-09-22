import assert from 'node:assert/strict';
import test from 'node:test';
import { auditExpectedToolCalls } from './semantic-audit.ts';

test('semantic audit accepts the expected tool sequence with unrelated calls between steps', () => {
  const result = auditExpectedToolCalls(['WebSearch', 'profile_read', 'TailorResumeForOpportunity'], ['TodoWrite', 'WebSearch', 'profile_read', 'Read', 'TailorResumeForOpportunity']);
  assert.equal(result.accepted, true);
  assert.equal(result.missingCallCount, 0);
  assert.equal(result.orderValid, true);
});

test('semantic audit rejects missing and reordered expected calls without exposing names', () => {
  const missing = auditExpectedToolCalls(['BuildBaseResumeBank', 'TailorResumeForOpportunity'], ['Write']);
  assert.deepEqual(missing.issues, ['expected_tool_calls_missing']);
  assert.equal(JSON.stringify(missing).includes('TailorResumeForOpportunity'), false);

  const reordered = auditExpectedToolCalls(['BuildBaseResumeBank', 'TailorResumeForOpportunity'], ['TailorResumeForOpportunity', 'BuildBaseResumeBank']);
  assert.deepEqual(reordered.issues, ['expected_tool_order_mismatch']);
});
