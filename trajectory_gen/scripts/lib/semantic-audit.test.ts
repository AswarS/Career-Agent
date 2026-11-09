import assert from 'node:assert/strict';
import test from 'node:test';
import { auditExpectedToolCalls, auditExpectedToolResults } from './semantic-audit.ts';

test('semantic audit accepts the expected tool sequence with unrelated calls between steps', () => {
  const result = auditExpectedToolCalls(['WebSearch', 'profile_read', 'TailorResumeForOpportunity'], ['TodoWrite', 'WebSearch', 'profile_read', 'Read', 'TailorResumeForOpportunity']);
  assert.equal(result.accepted, true);
  assert.equal(result.missingCallCount, 0);
  assert.equal(result.orderValid, true);
});

test('failed, missing, duplicated and insufficient required results cannot pass by name alone', () => {
  const call = { payload: { type: 'tool.call', name: 'Explore', toolUseId: 'one' } };
  const result = (content: unknown, isError = false) => ({ payload: { type: 'tool.result', toolUseId: 'one', content, isError } });
  for (const results of [[], [result('unreported Skill', true)], [result(JSON.stringify({ outcome: 'insufficient_input' }))], [result({ outcome: 'partial' })], [result('ok'), result('ok')]]) {
    assert.equal(auditExpectedToolResults(['Explore'], [call, ...results]).accepted, false);
  }
  assert.equal(auditExpectedToolResults(['Explore'], [call, result({ outcome: 'success' })]).accepted, true);
});

test('a successful recovery can satisfy the workflow but successful steps must retain order', () => {
  const events = [
    { payload: { type: 'tool.call', name: 'Search', toolUseId: 'failed' } },
    { payload: { type: 'tool.result', toolUseId: 'failed', isError: true, content: 'timeout' } },
    { payload: { type: 'tool.call', name: 'Search', toolUseId: 'retry' } },
    { payload: { type: 'tool.result', toolUseId: 'retry', isError: false, content: 'ok' } },
    { payload: { type: 'tool.call', name: 'Explore', toolUseId: 'last' } },
    { payload: { type: 'tool.result', toolUseId: 'last', isError: false, content: [{ text: '{"outcome":"success"}' }] } },
  ];
  assert.equal(auditExpectedToolResults(['Search', 'Explore'], events).accepted, true);
  assert.equal(auditExpectedToolResults(['Explore', 'Search'], events).accepted, false);
});

test('semantic audit rejects missing and reordered expected calls without exposing names', () => {
  const missing = auditExpectedToolCalls(['BuildBaseResumeBank', 'TailorResumeForOpportunity'], ['Write']);
  assert.deepEqual(missing.issues, ['expected_tool_calls_missing']);
  assert.equal(JSON.stringify(missing).includes('TailorResumeForOpportunity'), false);

  const reordered = auditExpectedToolCalls(['BuildBaseResumeBank', 'TailorResumeForOpportunity'], ['TailorResumeForOpportunity', 'BuildBaseResumeBank']);
  assert.deepEqual(reordered.issues, ['expected_tool_order_mismatch']);
});
