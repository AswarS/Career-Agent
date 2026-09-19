import { createHash } from 'node:crypto';
import type { RunRecord } from '../contracts.ts';

export interface Verification { passed: boolean; failures: string[] }
export function verifyRun(run: RunRecord, trajectory: any, proof: string, requireSkill = false): Verification {
  const failures: string[] = [];
  if (run.status !== 'completed') failures.push(`run_${run.status}`);
  if (!run.harness?.userId || !run.harness.conversationId || !run.harness.workspaceRoot) failures.push('missing_harness_binding');
  if (run.policy.conversationMemory !== false || run.policy.captureAgentRole !== 'main') failures.push('invalid_training_policy');
  for (const file of run.input.workspace.files) {
    const bytes = Buffer.from(file.content, file.encoding);
    const actual = run.initialFiles.find(item => item.path === file.path);
    if (!actual || actual.bytes !== bytes.length || actual.sha256 !== createHash('sha256').update(bytes).digest('hex')) failures.push(`initial_file_mismatch:${file.path}`);
  }
  const events = trajectory.events ?? [];
  const requests = events.filter((e: any) => e.payload.type === 'model.request');
  if (!requests.length) failures.push('no_main_model_requests');
  for (const event of events) {
    const p = event.payload;
    if (p.type.startsWith('model.') && (p.identity?.agentRole !== 'main' || p.identity?.purpose !== 'policy' || p.identity?.agentId !== `main:${run.gatewaySessionId}` || p.identity?.parentAgentId)) failures.push('non_main_model_capture');
    if (p.type === 'model.request' && /<\/?conversation_memory>|<career-agent:conversation-memory-checkpoint>|career-agent:conversation-memory:start/.test(JSON.stringify(p.body))) failures.push('conversation_memory_prompt');
    if (p.type === 'model.response' && (!p.complete || !(p.status >= 200 && p.status < 300))) failures.push('incomplete_model_response');
  }
  for (const request of requests) {
    const replies = events.filter((e: any) => e.payload.type === 'model.response' && e.payload.identity?.requestId === request.payload.identity.requestId);
    if (replies.length !== 1) failures.push('request_response_mismatch');
  }
  const calls = events.filter((e: any) => e.payload.type === 'tool.call');
  const results = events.filter((e: any) => e.payload.type === 'tool.result');
  if (!results.some((e: any) => !e.payload.isError && JSON.stringify(e.payload.content).includes(proof))) failures.push('workspace_proof_not_read');
  const answers = events.filter((e: any) => e.payload.type === 'user.answer' && e.payload.source === 'user_simulator');
  if (!answers.length || !answers.every((answer: any) => calls.some((c: any) => c.payload.toolUseId === answer.payload.toolUseId && /ask.*user.*question/i.test(c.payload.name.replaceAll('_', ''))) && results.some((r: any) => r.payload.toolUseId === answer.payload.toolUseId && !r.payload.isError))) failures.push('user_simulator_tool_roundtrip_missing');
  if (requireSkill && !calls.some((e: any) => /skill/i.test(e.payload.name))) failures.push('skill_tool_not_exercised');
  return { passed: failures.length === 0, failures: [...new Set(failures)] };
}

export function verifyIsolation(runs: RunRecord[]): Verification {
  const failures: string[] = [];
  for (const key of ['userId', 'conversationId', 'workspaceRoot'] as const) {
    const values = runs.map(run => run.harness?.[key]);
    if (values.some(v => v === undefined) || new Set(values).size !== runs.length) failures.push(`shared_or_missing_${key}`);
  }
  if (new Set(runs.map(r => r.gatewaySessionId)).size !== runs.length) failures.push('shared_gateway_session');
  return { passed: failures.length === 0, failures };
}
