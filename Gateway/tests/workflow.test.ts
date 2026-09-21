import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { RunStore } from '../src/sessions/run-store.ts';
import { validateCreateRun } from '../src/api/validation.ts';
import { runWorkflow } from '../src/workflow/run.ts';
import { verifyRun, verifyIsolation } from '../src/workflow/verify.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { loadConfig } from '../src/config.ts';
import { HttpHarnessClient } from '../src/harness/client.ts';

const task = () => validateCreateRun({ taskId: 'acceptance', profile: { fullName: 'Alice' }, query: 'read and ask', modelProfile: 'policy', userSimulator: { modelProfile: 'user' }, workspace: { files: [] }, limits: { timeoutMs: 1000 } });
async function fixture(t: TestContext, options: { ready?: boolean; wrongProof?: boolean; tokenReady?: boolean; stuck?: boolean } = {}) {
  const output = await mkdtemp(join(tmpdir(), 'gateway-workflow-'));
  const store = new RunStore(); const finalized: string[] = [], cleaned: string[] = [], cancelled: string[] = [];
  let created = 0;
  const archive = (id: string) => {
    const run = store.get(id); const proof = run.input.workspace.files.at(-1)!.content;
    const identity = { agentRole: 'main', purpose: 'policy', agentId: `main:${run.gatewaySessionId}`, requestId: 'r' };
    return { events: [
      { payload: { type: 'model.request', identity, body: { messages: [] } } },
      { payload: { type: 'model.response', identity, complete: true, status: 200 } },
      { payload: { type: 'tool.call', name: 'Read', toolUseId: 'read' } },
      { payload: { type: 'tool.result', toolUseId: 'read', content: options.wrongProof ? 'wrong' : proof } },
      { payload: { type: 'tool.call', name: 'Ask_User_Question', toolUseId: 'ask' } },
      { payload: { type: 'user.answer', source: 'user_simulator', toolUseId: 'ask' } },
      { payload: { type: 'tool.result', toolUseId: 'ask', content: 'answer' } },
      ...(options.tokenReady ? [{ payload: { type: 'training.tokens', requestId: 'r' } }] : []),
    ], finalized: finalized.includes(id), trainingReady: options.tokenReady === true, reasons: options.tokenReady ? [] : ['missing_or_duplicate_tokens'] };
  };
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-secret');
    const parts = req.url!.split('/'); const id = parts[3]!; let response: any;
    if (req.url === '/v1/capabilities') response = { capabilities: Object.fromEntries(['harnessExecution', 'modelProxy', 'mainAgentCapture', 'userSimulator', 'trajectoryExport', 'trajectoryFinalization'].map(k => [k, true])) };
    else if (req.url === '/v1/readiness') response = { ready: options.ready !== false, backend: { implementation: 'career-agent-nestjs' } };
    else if (req.url === '/v1/runs') {
      let text = ''; for await (const chunk of req) text += chunk;
      const run = store.create(JSON.parse(text)); created++;
      response = store.update(run.runId, { status: options.stuck ? 'running' : 'completed', harness: { userId: created, conversationId: `conv-${created}`, workspaceRoot: `/workspace/${created}` }, initialFiles: run.input.workspace.files.map(f => { const b = Buffer.from(f.content, f.encoding); return { path: f.path, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }; }) });
    } else if (parts[4] === 'trajectory') response = archive(id);
    else if (parts[4] === 'finalize') { finalized.push(id); response = { finalized: true }; }
    else if (parts[4] === 'cancel') { cancelled.push(id); response = store.get(id); }
    else if (req.method === 'DELETE') { cleaned.push(id); response = { cleanup: 'completed' }; }
    else response = store.get(id);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(response));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); await rm(output, { recursive: true, force: true }); });
  return { output, gatewayUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, finalized, cleaned, cancelled, store, archive, created: () => created };
}

test('workflow drives two isolated service runs, verifies proofs and writes export/report artifacts', async t => {
  const f = await fixture(t);
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task(), cleanup: true, pollMs: 1 });
  assert.equal(report.passed, true); assert.equal(f.created(), 2); assert.equal(f.finalized.length, 2); assert.deepEqual(f.cleaned, f.finalized);
  assert.equal(report.runs.every((r: any) => r.trainingReady === false), true);
  assert.equal(JSON.parse(await readFile(join(f.output, 'report.json'), 'utf8')).passed, true);
  assert.ok(!JSON.stringify(report).includes('test-secret'));
  assert.equal((JSON.parse(await readFile(join(f.output, report.runs[0].artifact), 'utf8'))).finalized, true);
  await assert.rejects(runWorkflow({ ...f, token: 'test-secret', task: task() }), /output_directory_not_empty/);
});

test('preflight failure allocates no user tasks and returns a failed report', async t => {
  const f = await fixture(t, { ready: false });
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task() });
  assert.equal(report.passed, false); assert.equal(f.created(), 0); assert.deepEqual(report.failures, ['backend_not_ready']);
});

test('bad workspace evidence fails acceptance and only cancels/cleans owned runs', async t => {
  const f = await fixture(t, { wrongProof: true });
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task(), cleanup: true });
  assert.equal(report.passed, false); assert.ok(report.runs[0].check.failures.includes('workspace_proof_not_read'));
  assert.deepEqual(f.cancelled, report.runs.map((r: any) => r.runId)); assert.deepEqual(f.cleaned, f.cancelled);
});

test('strict token mode leaves missing-token runs unsealed instead of claiming training success', async t => {
  const f = await fixture(t);
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task(), requireTrainingReady: true, tokenWaitMs: 0 });
  assert.equal(report.passed, false); assert.equal(f.finalized.length, 0); assert.ok(report.failures.includes('training_tokens_not_received_before_deadline'));
});

test('strict token mode finalizes when producer data has arrived', async t => {
  const f = await fixture(t, { tokenReady: true });
  assert.equal((await runWorkflow({ ...f, token: 'test-secret', task: task(), requireTrainingReady: true })).passed, true);
});

test('verifier detects hidden model capture, missing answers and shared workspace', async t => {
  const f = await fixture(t);
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task() });
  const run = f.store.get(report.runs[0].runId); const a = f.archive(run.runId);
  a.events[0]!.payload.identity!.agentRole = 'subagent';
  a.events = a.events.filter(e => e.payload.type !== 'user.answer');
  const check = verifyRun(run, a, run.input.workspace.files.at(-1)!.content, true);
  assert.ok(check.failures.includes('non_main_model_capture')); assert.ok(check.failures.includes('user_simulator_tool_roundtrip_missing')); assert.ok(check.failures.includes('skill_tool_not_exercised'));
  assert.equal(verifyIsolation([run, run]).passed, false);
});

test('readiness route is authenticated and reports unavailable adapters without model calls', async t => {
  const server = createGatewayServer(loadConfig({ GATEWAY_API_TOKEN: 'secret' })); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/readiness`;
  assert.equal((await fetch(url)).status, 401);
  const report = await (await fetch(url, { headers: { authorization: 'Bearer secret' } })).json() as any;
  assert.equal(report.ready, false); assert.equal(report.modelApiProbed, false);
});

test('backend readiness client whitelists response fields and never exposes unexpected backend data', async t => {
  const server = createServer((req, res) => {
    assert.equal(req.url, '/runs/readiness'); assert.equal(req.headers.authorization, 'Bearer secret');
    res.end(JSON.stringify({ implementation: 'career-agent-nestjs', protocolVersion: 1, databaseReachable: true, apiKey: 'must-not-leak' }));
  }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const result = await new HttpHarnessClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'secret').readiness();
  assert.deepEqual(result, { implementation: 'career-agent-nestjs', protocolVersion: 1, databaseReachable: true });
});

test('interruption cancels only acknowledged runs and records the failed acceptance', async t => {
  const f = await fixture(t, { stuck: true }); const abort = new AbortController();
  const timer = setInterval(() => { if (f.created() === 2) abort.abort(); }, 5);
  t.after(() => clearInterval(timer));
  const report = await runWorkflow({ ...f, token: 'test-secret', task: task(), signal: abort.signal, pollMs: 1 });
  assert.equal(report.passed, false); assert.ok(report.failures.includes('interrupted'));
  assert.equal(f.cancelled.length, 2); assert.equal(report.cancellation.every((c: any) => c.confirmed), true);
});
