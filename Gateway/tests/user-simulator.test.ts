import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HarnessCore } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';
import { RunStore } from '../src/sessions/run-store.ts';
import { HarnessRunner } from '../src/harness/runner.ts';
import type { HarnessClient, HarnessSnapshot } from '../src/harness/client.ts';
import { UserSimulator, questionRequest, simulatorPrompt, validateAnswers } from '../src/user-simulator/simulator.ts';
import { loadConfig } from '../src/config.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { validateCreateRun } from '../src/api/validation.ts';

const question = { question: '希望在哪个城市工作？', header: '城市', multiSelect: false, options: [{ label: '上海', description: '上海岗位' }, { label: '北京', description: '北京岗位' }] };
const answer = { [question.question]: '上海' };
function task(simulated = true) {
  return validateCreateRun({ taskId: 'user-terminal', profile: { fullName: 'Alice', targetCity: '上海' }, query: '帮我找工作', workspace: { files: [] }, modelProfile: 'policy', userSimulator: simulated ? { modelProfile: 'user' } : null, limits: { timeoutMs: 5000, maxModelCalls: 10, maxUserQuestions: 2 } });
}
async function until(predicate: () => boolean | Promise<boolean>) {
  const end = Date.now() + 4000;
  while (!await predicate()) { if (Date.now() > end) throw new Error('test timeout'); await delay(10); }
}
async function listen(server: Server, t: TestContext) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function coreFixture(t: TestContext, count = 1, parallel = false) {
  const root = await mkdtemp(join(tmpdir(), 'career-user-test-'));
  const waiters = new Map<string, () => void>(); const received: unknown[] = [];
  let user = 0;
  const core = new HarnessCore({
    validate: () => {}, createUser: async () => ++user, initializeProfile: async () => {}, configureModel: async () => {}, workspace: id => join(root, String(id)), createConversation: async id => `conversation-${id}`,
    execute: async function* (binding, _query, signal) {
      const waits: Promise<void>[] = [];
      yield { type: 'message.block.completed', messageId: 'm1', block: { id: 'text1', type: 'text', text: '请确认工作地点。' } };
      yield { type: 'message.block.completed', block: { type: 'status', text: 'HIDDEN_REASONING' } };
      yield { type: 'message.block.completed', block: { type: 'tool_result', text: 'HIDDEN_FILE_CONTENT' } };
      for (let i = 0; i < count; i++) {
        const id = `q${i}`;
        const wait = new Promise<void>(resolve => {
          waiters.set(`${binding.conversationId}:${id}`, resolve);
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        const event = { type: 'message.block.completed', block: { type: 'ask_question', status: 'pending', toolUseId: id, questions: [question] } };
        yield event; yield event; // Duplicate projection must not consume a second question.
        if (parallel) { waits.push(wait); continue; }
        await wait; signal.throwIfAborted();
        yield { type: 'message.block.completed', block: { type: 'tool_result', toolUseId: id } };
      }
      await Promise.all(waits); signal.throwIfAborted();
      yield { type: 'message.completed', status: 'done', reply: '完成' };
    },
    respond: async (binding, id, answers) => { received.push({ conversation: binding.conversationId, id, answers }); waiters.get(`${binding.conversationId}:${id}`)!(); },
    dispose: async () => {}, cleanup: async () => {},
  });
  t.after(async () => { await core.shutdown(); await rm(root, { recursive: true, force: true }); });
  const client: HarnessClient = {
    prepare: async run => core.prepare(run) as HarnessSnapshot,
    get: async id => core.get(id) as HarnessSnapshot,
    start: async id => core.start(id) as HarnessSnapshot,
    cancel: async id => await core.cancel(id) as HarnessSnapshot,
    cleanup: async id => await core.cleanup(id) as HarnessSnapshot,
    respond: async (id, toolId, answers) => await core.respond(id, toolId, answers) as HarnessSnapshot,
  };
  return { core, client, received };
}
async function modelFixture(t: TestContext, provider: 'openai' | 'anthropic' = 'openai', bad = false) {
  const requests: any[] = [];
  const url = await listen(createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ body: JSON.parse(raw), headers: req.headers, path: req.url });
    res.setHeader('content-type', 'application/json');
    const content = JSON.stringify({ answers: answer });
    res.end(JSON.stringify(provider === 'openai' ? { choices: [{ finish_reason: bad ? 'length' : 'stop', message: { content } }] } : { stop_reason: bad ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: content }] }));
  }), t);
  const model = { provider, baseUrl: url, apiKey: 'user-secret', model: 'user-model' };
  return { requests, model, simulator: new UserSimulator({ user: model }) };
}

test('prompt includes Profile, Query, safe history; validates exact keys and free/multiple answers', () => {
  const run = new RunStore().create(task());
  run.pendingQuestion = { toolUseId: 'q', questions: [question] };
  const request = questionRequest(run, [{ role: 'user', content: '我选择上海' }]);
  const payload = JSON.parse(simulatorPrompt(request)[1]!.content);
  assert.deepEqual(payload.Profile, run.input.profile); assert.equal(payload.Query, run.input.query);
  assert.equal(payload.VisibleHistory[0].content, '我选择上海');
  assert.deepEqual(validateAnswers(request, { [question.question]: '上海, 北京' }), { [question.question]: '上海, 北京' });
  assert.throws(() => validateAnswers(request, { wrong: '上海' }));
  assert.throws(() => validateAnswers(request, { [question.question]: '' }));
  assert.throws(() => validateAnswers(request, { [question.question]: '上海', extra: 'x' }));
});

test('automatic simulator completes two tool waits, includes prior answers and excludes hidden data', async t => {
  const f = await coreFixture(t, 2); const model = await modelFixture(t);
  const store = new RunStore(10, true); const run = store.create(task()); const events: any[] = [];
  const runner = new HarnessRunner(store, f.client, 5, model.simulator, async (_id, event) => { events.push(event); });
  t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => store.get(run.runId).status === 'completed');
  assert.equal(model.requests.length, 2); assert.equal(f.received.length, 2); assert.equal(events.length, 2);
  assert.ok(JSON.parse(model.requests[1].body.messages[1].content).VisibleHistory.some((h: any) => h.role === 'user' && h.content.includes('上海')));
  assert.ok(!JSON.stringify(model.requests).includes('HIDDEN_'));
  assert.equal(model.requests[0].headers.authorization, 'Bearer user-secret');
  assert.equal(model.requests[0].headers['x-training-agent-role'], undefined);
  assert.ok(!JSON.stringify(events).includes('user-secret'));
  await f.core.respond(run.runId, 'q0', answer); assert.equal(f.received.length, 2);
  await assert.rejects(f.core.respond(run.runId, 'q0', { [question.question]: '北京' }), /Conflicting/);
});

test('Anthropic user API works and truncated model answers are rejected for both protocols', async t => {
  const run = new RunStore().create(task()); run.pendingQuestion = { toolUseId: 'q', questions: [question] };
  const request = questionRequest(run);
  const good = await modelFixture(t, 'anthropic');
  assert.deepEqual(await good.simulator.answer('user', request, new AbortController().signal), answer);
  assert.equal(good.requests[0].path, '/v1/messages'); assert.ok(good.requests[0].body.system.includes('simulate the user'));
  for (const protocol of ['openai', 'anthropic'] as const) {
    const bad = await modelFixture(t, protocol, true);
    await assert.rejects(bad.simulator.answer('user', request, new AbortController().signal), /incomplete/);
  }
});

test('question budget counts unique tool requests and fails before a second simulator call', async t => {
  const f = await coreFixture(t, 2); const model = await modelFixture(t);
  const input = task(); input.limits.maxUserQuestions = 1;
  const store = new RunStore(10, true); const run = store.create(input);
  const runner = new HarnessRunner(store, f.client, 5, model.simulator); t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => store.get(run.runId).status === 'failed');
  assert.equal(store.get(run.runId).error, 'max_user_questions_exceeded');
  assert.equal(model.requests.length, 1); assert.equal(f.received.length, 1);
});

test('external terminal HTTP enforces auth, validation, deduplication and run isolation', async t => {
  const f = await coreFixture(t); const store = new RunStore(10, true);
  const server = createGatewayServer(loadConfig({ GATEWAY_API_TOKEN: 'gateway-secret' }), store, f.client);
  t.after(() => server.shutdownHarness()); const base = await listen(server, t);
  const headers = { authorization: 'Bearer gateway-secret', 'content-type': 'application/json' };
  const make = async () => (await (await fetch(`${base}/v1/runs`, { method: 'POST', headers, body: JSON.stringify(task(false)) })).json()) as any;
  const a = await make(), b = await make();
  await until(() => store.get(a.runId).status === 'waiting_user' && store.get(b.runId).status === 'waiting_user');
  const url = `${base}/v1/runs/${a.runId}/user-questions/q0/respond`;
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ answers: { wrong: 'x' } }) })).status, 400);
  const responses = await Promise.all([1, 2].map(() => fetch(url, { method: 'POST', headers, body: JSON.stringify({ answers: answer }) })));
  assert.deepEqual(responses.map(r => r.status), [200, 200]); assert.equal(f.received.length, 1);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ answers: { [question.question]: '北京' } }) })).status, 409);
  assert.equal(store.get(b.runId).status, 'waiting_user');
});

test('cancellation aborts in-flight user inference and never delivers an answer', async t => {
  const f = await coreFixture(t); let called = false; let closed = false;
  const url = await listen(createServer((req, res) => { req.resume(); called = true; res.on('close', () => { closed = true; }); }), t);
  const simulator = new UserSimulator({ user: { provider: 'openai', baseUrl: url, apiKey: 'secret', model: 'user' } });
  const store = new RunStore(10, true), run = store.create(task());
  const runner = new HarnessRunner(store, f.client, 5, simulator); t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => called); await runner.cancel(run.runId); await until(() => closed);
  assert.equal(store.get(run.runId).status, 'cancelled'); assert.equal(f.received.length, 0);
});

test('HTTP harness adapter delivers answers to the service endpoint with original identities', async t => {
  const f = await coreFixture(t); const model = await modelFixture(t);
  const url = await listen(createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer harness-secret');
    let text = ''; for await (const c of req) text += c;
    const parts = req.url!.split('/'); const id = parts[2]!;
    const body = text ? JSON.parse(text) : {};
    let result;
    if (req.url === '/runs') result = f.core.prepare(body);
    else if (parts[3] === 'start') result = f.core.start(id);
    else if (parts[3] === 'cancel') result = await f.core.cancel(id);
    else if (parts[3] === 'user-questions') result = await f.core.respond(id, parts[4]!, body.answers);
    else result = f.core.get(id);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result));
  }), t);
  const server = createGatewayServer(loadConfig({ GATEWAY_HARNESS_URL: url, GATEWAY_HARNESS_TOKEN: 'harness-secret', GATEWAY_USER_MODELS_JSON: JSON.stringify({ user: model.model }) }));
  t.after(() => server.shutdownHarness()); const base = await listen(server, t);
  const response = await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(task()) });
  assert.equal(response.status, 201); const run = await response.json() as any;
  await until(async () => (await (await fetch(`${base}/v1/runs/${run.runId}`)).json() as any).status === 'completed');
  assert.equal(f.received.length, 1);
  const bad = task(); bad.userSimulator = { modelProfile: 'unknown' };
  assert.equal((await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bad) })).status, 400);
});

test('concurrent automatic requests and lost delivery acknowledgment do not resample or redeliver', async t => {
  const f = await coreFixture(t); const model = await modelFixture(t);
  const original = f.client.respond!; let calls = 0;
  f.client.respond = async (...args) => {
    const value = await original(...args);
    if (++calls === 1) throw new Error('lost acknowledgment');
    return value;
  };
  const store = new RunStore(10, true); const run = store.create(task());
  const runner = new HarnessRunner(store, f.client, 100, model.simulator); t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => f.core.get(run.runId).status === 'waiting_user');
  await Promise.all([runner.respond(run.runId, 'q0'), runner.respond(run.runId, 'q0')]);
  await until(() => store.get(run.runId).status === 'completed');
  assert.equal(model.requests.length, 1); assert.equal(calls, 2); assert.equal(f.received.length, 1);
});

test('zero question allowance blocks the first question without calling the user API', async t => {
  const f = await coreFixture(t); const model = await modelFixture(t);
  const input = task(); input.limits.maxUserQuestions = 0;
  const store = new RunStore(10, true); const run = store.create(input);
  const runner = new HarnessRunner(store, f.client, 5, model.simulator); t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => store.get(run.runId).status === 'failed');
  assert.equal(store.get(run.runId).error, 'max_user_questions_exceeded'); assert.equal(model.requests.length, 0);
});

test('invalid user API output fails the run without submitting an invented answer', async t => {
  for (const payload of ['not JSON', JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answers":{"wrong":"x"}}' } }] })]) {
    const f = await coreFixture(t);
    const url = await listen(createServer((req, res) => { req.resume(); res.end(payload); }), t);
    const store = new RunStore(10, true); const run = store.create(task());
    const runner = new HarnessRunner(store, f.client, 5, new UserSimulator({ user: { provider: 'openai', baseUrl: url, apiKey: 'secret', model: 'user' } }));
    t.after(() => runner.shutdown()); runner.launch(run.runId);
    await until(() => store.get(run.runId).status === 'failed');
    assert.equal(f.received.length, 0); assert.equal(f.core.get(run.runId).status, 'cancelled');
  }
});

test('run deadline aborts a stalled simulator request', async t => {
  const f = await coreFixture(t); let closed = false;
  const url = await listen(createServer((req, res) => { req.resume(); res.on('close', () => { closed = true; }); }), t);
  const input = task(); input.limits.timeoutMs = 1000;
  const store = new RunStore(10, true); const run = store.create(input);
  const runner = new HarnessRunner(store, f.client, 5, new UserSimulator({ user: { provider: 'openai', baseUrl: url, apiKey: 'secret', model: 'user' } }));
  t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => store.get(run.runId).status === 'timed_out'); await until(() => closed);
  assert.equal(f.received.length, 0);
});

test('multiple pending tools queue in order without overwriting the first question', async t => {
  const f = await coreFixture(t, 2, true);
  const run = new RunStore().create(task(false)); f.core.prepare(run);
  await until(() => f.core.get(run.runId).status === 'ready'); f.core.start(run.runId);
  await until(() => f.core.get(run.runId).status === 'waiting_user'); await delay(10);
  assert.equal(f.core.get(run.runId).pendingQuestion!.toolUseId, 'q0');
  await assert.rejects(f.core.respond(run.runId, 'q1', answer), /not waiting/);
  await f.core.respond(run.runId, 'q0', answer);
  assert.equal(f.core.get(run.runId).pendingQuestion!.toolUseId, 'q1');
  await f.core.respond(run.runId, 'q1', answer);
  await until(() => f.core.get(run.runId).status === 'completed');
  assert.equal(f.received.length, 2);
});

test('answer capture failure prevents tool delivery', async t => {
  const f = await coreFixture(t); const model = await modelFixture(t);
  const store = new RunStore(10, true); const run = store.create(task());
  const runner = new HarnessRunner(store, f.client, 5, model.simulator, async () => { throw new Error('disk full'); });
  t.after(() => runner.shutdown()); runner.launch(run.runId);
  await until(() => store.get(run.runId).status === 'failed');
  assert.equal(model.requests.length, 1); assert.equal(f.received.length, 0);
});
