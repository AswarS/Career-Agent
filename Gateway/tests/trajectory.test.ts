import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdtemp, rm, mkdir, appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { TraceStore } from '../src/trajectories/trace-store.ts';
import { RunStore } from '../src/sessions/run-store.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { loadConfig } from '../src/config.ts';
import { validateCreateRun } from '../src/api/validation.ts';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'gateway-journal-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const id = randomUUID(), session = randomUUID(), journal = new TraceStore(root);
  const identity = { runId: id, gatewaySessionId: session, requestId: 'req-1', agentId: `main:${session}`, agentRole: 'main', purpose: 'policy', parentAgentId: null };
  const envelope = (eventId: string, payload: Record<string, any>) => ({ schemaVersion: '1.0', runId: id, eventId, occurredAt: '2026-09-19T00:00:00.000Z', payload });
  const request = envelope('request', { type: 'model.request', identity, protocol: 'openai', body: { model: 'policy', messages: [{ role: 'user', content: 'Hello' }] } });
  const response = envelope('response', { type: 'model.response', identity, protocol: 'openai', status: 200, complete: true, rawBody: '{}' });
  const tokens = envelope('tokens', { type: 'training.tokens', requestId: 'req-1', tokens: { source: 'inference_engine', modelVersion: 'policy-v1', tokenizerVersion: 'tok-v1', tokenIds: [10, 11, 12], promptTokenCount: 2, lossMask: [0, 0, 1], logprobs: [null, null, -0.2] } });
  const ingest = (event: any) => journal.ingest(id, session, event);
  const complete = async () => { await ingest(request); await ingest(response); await ingest(tokens); };
  return { root, id, session, identity, journal, envelope, request, response, tokens, ingest, complete, run: { status: 'completed', gatewaySessionId: session } };
}

test('durable append assigns sequence, coalesces duplicates and rejects conflicting payloads', async t => {
  const f = await fixture(t);
  const result = await Promise.all([f.ingest(f.request), f.ingest(f.request)]);
  assert.deepEqual(result.map(e => e.sequence), [1, 1]);
  await assert.rejects(f.ingest({ ...f.request, payload: { ...f.request.payload, body: {} } }), /different content/);
  await f.ingest(f.response); assert.equal((await f.journal.events(f.id)).nextCursor, 2);
  assert.equal((await new TraceStore(f.root).ingest(f.id, f.session, f.request)).sequence, 1);
});

test('finalization freezes log, checksums archive and restores exports after restart', async t => {
  const f = await fixture(t); await f.complete();
  const manifest = await f.journal.finalize(f.id, f.run);
  assert.equal(manifest.trainingReady, true); assert.equal(manifest.eventCount, 4);
  assert.deepEqual(await f.journal.finalize(f.id, f.run), manifest);
  assert.equal((await f.ingest(f.tokens)).sequence, 3);
  await assert.rejects(f.ingest(f.envelope('late', f.response.payload)), /immutable/);
  const recovered = await new TraceStore(f.root).export(f.id);
  assert.deepEqual(recovered.manifest, manifest); assert.deepEqual(recovered.samples[0]!.tokenIds, [10, 11, 12]);
  assert.equal(recovered.trainingReady, true);
});

test('finalize serializes pending writes and never seals an active run', async t => {
  const f = await fixture(t);
  await assert.rejects(f.journal.finalize(f.id, { ...f.run, status: 'running' }), /Finish or cancel/);
  const writes = [f.ingest(f.request), f.ingest(f.response), f.ingest(f.tokens)];
  const manifest = await f.journal.finalize(f.id, f.run); await Promise.all(writes);
  assert.equal(manifest.eventCount, 4); assert.equal(manifest.trainingReady, true);
});

test('unsealed recovery truncates only a torn tail and resumes committed sequence', async t => {
  const f = await fixture(t); await f.ingest(f.request);
  await appendFile(join(f.root, `${f.id}.events.jsonl`), '{"partial":');
  const recovered = new TraceStore(f.root);
  assert.equal((await recovered.ingest(f.id, f.session, f.response)).sequence, 2);
  assert.equal((await recovered.events(f.id)).events.length, 2);
});

test('malformed complete lines and altered sealed archives fail closed', async t => {
  const f = await fixture(t); await f.complete(); await f.journal.finalize(f.id, f.run);
  const path = join(f.root, `${f.id}.events.jsonl`);
  const text = await readFile(path, 'utf8'); await writeFile(path, text.replace('Hello', 'Tampered'));
  await assert.rejects(new TraceStore(f.root).export(f.id), /checksum/);
  const g = await fixture(t); await g.ingest(g.request);
  await appendFile(join(g.root, `${g.id}.events.jsonl`), 'bad JSON\n');
  await assert.rejects(new TraceStore(g.root).events(g.id));
});

test('masks, token lengths, provenance, versions and unknown request references are rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(f.ingest(f.tokens), /captured main request/);
  await f.ingest(f.request);
  for (const patch of [{ source: 'estimated' }, { modelVersion: '' }, { tokenIds: [1, -1, 2] }, { lossMask: [1, 0, 1] }, { logprobs: [null, null, null] }, { logprobs: [null, null, 0.2] }, { promptTokenCount: 3 }]) {
    await assert.rejects(f.ingest({ ...f.tokens, payload: { ...f.tokens.payload, tokens: { ...f.tokens.payload.tokens, ...patch } } }), /invalid/i);
  }
  await f.ingest(f.tokens);
  await assert.rejects(f.ingest({ ...f.tokens, eventId: 'other-tokens' }), /One token sample/);
});

test('missing tokens, failed calls and unmatched tools never become training-ready', async t => {
  const f = await fixture(t); await f.ingest(f.request); await f.ingest(f.response);
  await f.ingest(f.envelope('tool', { type: 'tool.call', agentId: `main:${f.session}`, toolUseId: 'tool1', name: 'SkillTool', input: {} }));
  const m = await f.journal.finalize(f.id, f.run);
  assert.equal(m.trainingReady, false); assert.ok(m.reasons.includes('missing_or_duplicate_tokens')); assert.ok(m.reasons.includes('missing_tool_result'));
  const g = await fixture(t); await g.ingest(g.request); await g.ingest({ ...g.response, payload: { ...g.response.payload, complete: false, status: 503 } }); await g.ingest(g.tokens);
  const failed = await g.journal.finalize(g.id, { ...g.run, status: 'failed' });
  assert.ok(failed.reasons.includes('run_not_completed')); assert.ok(failed.reasons.includes('incomplete_policy_call'));
});

test('foreign run, child Agent, memory contamination and producer finalization events are refused', async t => {
  const f = await fixture(t);
  await assert.rejects(f.ingest({ ...f.request, runId: randomUUID() }));
  await assert.rejects(f.ingest({ ...f.request, payload: { ...f.request.payload, identity: { ...f.identity, agentRole: 'subagent' } } }));
  await assert.rejects(f.ingest({ ...f.request, payload: { ...f.request.payload, body: { prompt: '<conversation_memory>' } } }));
  await assert.rejects(f.ingest(f.envelope('end', { type: 'run.finished', status: 'completed' })));
  assert.equal((await f.journal.events(f.id)).events.length, 0);
});

test('cursor pages preserve order and reject cursors beyond the log', async t => {
  const f = await fixture(t); await f.complete();
  const first = await f.journal.events(f.id, 0, 2), second = await f.journal.events(f.id, first.nextCursor, 2);
  assert.deepEqual([...first.events, ...second.events].map(e => e.sequence), [1, 2, 3]);
  await assert.rejects(f.journal.events(f.id, 99), /beyond/);
});

test('HTTP ingest, paginated SSE, finalize and archived export remain authenticated', async t => {
  const f = await fixture(t); const store = new RunStore();
  const run = store.create(validateCreateRun({ taskId: 'export', profile: {}, query: 'test', modelProfile: 'policy' }));
  const config = loadConfig({ GATEWAY_TRACE_DIR: f.root, GATEWAY_API_TOKEN: 'secret' });
  async function app() {
    const server = createGatewayServer(config, store); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/runs/${run.runId}`;
  }
  const base = await app(), headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };
  const post = (suffix: string, body?: unknown) => fetch(`${base}/${suffix}`, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await fetch(`${base}/trajectory-events`)).status, 401);
  assert.equal((await post('finalize')).status, 409);
  for (const input of [f.request, f.response, f.tokens]) {
    const event = structuredClone(input); event.runId = run.runId;
    if (event.payload.identity) event.payload.identity = { ...event.payload.identity, runId: run.runId, gatewaySessionId: run.gatewaySessionId, agentId: `main:${run.gatewaySessionId}` };
    assert.equal((await post('trajectory-events', event)).status, 200);
  }
  const sse = await (await fetch(`${base}/trajectory-events?limit=1`, { headers: { ...headers, accept: 'text/event-stream', 'last-event-id': '1' } })).text();
  assert.ok(sse.includes('id: 2\n')); assert.ok(!sse.includes('id: 1\n')); assert.ok(sse.includes('event: checkpoint'));
  store.update(run.runId, { status: 'completed' });
  assert.equal((await (await post('finalize')).json() as any).trainingReady, true);
  const server = createGatewayServer(config); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  const recovered = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/runs/${run.runId}/trajectory`, { headers });
  assert.equal((await recovered.json() as any).trainingReady, true);
});

test('write failure poisons later writes and finalization until explicit process recovery', async t => {
  const f = await fixture(t); await f.journal.events(f.id);
  const path = join(f.root, `${f.id}.events.jsonl`); await mkdir(path);
  await assert.rejects(f.ingest(f.request));
  await rm(path, { recursive: true });
  await assert.rejects(f.ingest(f.request), /journal_write_failed/);
  await assert.rejects(f.journal.finalize(f.id, f.run), /journal_write_failed/);
  assert.equal((await new TraceStore(f.root).ingest(f.id, f.session, f.request)).sequence, 1);
});

test('response order and protocol inconsistencies block training export', async t => {
  const f = await fixture(t);
  await f.ingest({ ...f.response, payload: { ...f.response.payload, protocol: 'anthropic' } });
  await f.ingest(f.request); await f.ingest(f.tokens);
  const manifest = await f.journal.finalize(f.id, f.run);
  assert.equal(manifest.trainingReady, false);
  assert.ok(manifest.reasons.includes('invalid_policy_response_order_or_protocol'));
});
