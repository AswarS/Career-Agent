import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { HarnessCore, validateTrainingInput } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';
import type { HarnessPorts, TrainingInput } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';
import { HttpHarnessClient } from '../src/harness/client.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { loadConfig } from '../src/config.ts';

function input(): TrainingInput {
  return { runId: randomUUID(), gatewaySessionId: randomUUID(), input: {
    taskId: 'same-task', profile: { fullName: 'Alice' }, query: 'read input', modelProfile: 'test-policy',
    workspace: { files: [{ path: 'nested/resume.md', content: '简历', encoding: 'utf8' }] },
    limits: { timeoutMs: 5000, maxModelCalls: 10, maxUserQuestions: 2 },
  } };
}
async function until(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 4000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Test condition timed out');
    await delay(10);
  }
}
async function fixture(t: TestContext, overrides: Partial<HarnessPorts> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'career-gateway-test-'));
  let user = 0;
  const profiles = new Map<number, unknown>();
  const models = new Map<number, string>();
  const removed: number[] = [];
  const core = new HarnessCore({
    validate: () => {}, createUser: async () => ++user,
    initializeProfile: async (id, profile) => { profiles.set(id, profile); },
    configureModel: async (id, model) => { models.set(id, model); },
    workspace: id => join(root, String(id), 'workspace'),
    createConversation: async () => randomUUID(),
    execute: async function* (binding, query) {
      assert.equal(await readFile(join(binding.workspaceRoot, 'nested/resume.md'), 'utf8'), '简历');
      yield { type: 'message.completed', status: 'done', accepted: true, reply: query };
    },
    dispose: async () => {},
    cleanup: async id => {
      const target = resolve(root, String(id));
      assert.ok(target.startsWith(resolve(root) + sep));
      await rm(target, { recursive: true, force: true }); removed.push(id);
    },
    ...overrides,
  });
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return { core, root, profiles, models, removed };
}
async function listen(server: Server, t: TestContext) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('backend core prepares concurrent isolated users, profiles, workspaces and file hashes', async t => {
  const f = await fixture(t);
  const a = input(), b = input(); b.input.profile = { fullName: 'Bob' }; b.input.modelProfile = 'other-policy';
  f.core.prepare(a); f.core.prepare(b);
  await until(() => f.core.get(a.runId).status === 'ready' && f.core.get(b.runId).status === 'ready');
  const first = f.core.get(a.runId), second = f.core.get(b.runId);
  assert.notEqual(first.harness!.userId, second.harness!.userId);
  assert.notEqual(first.harness!.conversationId, second.harness!.conversationId);
  assert.notEqual(first.harness!.workspaceRoot, second.harness!.workspaceRoot);
  assert.deepEqual(f.profiles.get(first.harness!.userId), { fullName: 'Alice' });
  assert.equal(f.models.get(second.harness!.userId), 'other-policy');
  assert.equal(first.initialFiles[0]!.sha256, createHash('sha256').update('简历').digest('hex'));
  assert.equal(first.initialFiles[0]!.bytes, Buffer.byteLength('简历'));
  assert.equal(f.core.prepare(a).harness!.userId, first.harness!.userId);
  assert.throws(() => f.core.prepare({ ...a, input: { ...a.input, query: 'changed' } }), /different task/);
  f.core.start(a.runId); f.core.start(b.runId);
  await until(() => f.core.get(a.runId).status === 'completed' && f.core.get(b.runId).status === 'completed');
  assert.equal(f.core.get(a.runId).reply, 'read input');
  await Promise.all([f.core.cleanup(a.runId), f.core.cleanup(a.runId)]);
  assert.equal(f.removed.filter(id => id === first.harness!.userId).length, 1);
  assert.equal(await readFile(join(second.harness!.workspaceRoot, 'nested/resume.md'), 'utf8'), '简历');
  await f.core.cleanup(b.runId);
});

test('preparation failure rolls back partially initialized resources and supports cleanup retry', async t => {
  let cleanups = 0;
  const f = await fixture(t, {
    createConversation: async () => { throw new Error('database unavailable'); },
    cleanup: async () => { if (++cleanups === 1) throw new Error('temporarily locked'); },
  });
  const request = input(); f.core.prepare(request);
  await until(() => f.core.get(request.runId).cleanup === 'failed');
  assert.equal(f.core.get(request.runId).status, 'failed');
  assert.equal(f.core.get(request.runId).harness, null);
  assert.equal((await f.core.cleanup(request.runId)).cleanup, 'completed');
  assert.equal(cleanups, 2);
});

test('cancellation during preparation waits for allocation then rolls it back', async t => {
  let release!: (id: number) => void;
  const f = await fixture(t, { createUser: () => new Promise(resolve => { release = resolve; }) });
  const request = input(); f.core.prepare(request);
  await f.core.cancel(request.runId); release(91);
  await until(() => f.core.get(request.runId).cleanup === 'completed');
  assert.equal(f.core.get(request.runId).status, 'cancelled');
  assert.deepEqual(f.removed, [91]);
  assert.equal(f.profiles.size, 0);
});

test('Ask_User_Question stays waiting until timeout and execution receives abort', async t => {
  let aborted = false;
  const f = await fixture(t, {
    execute: async function* (_binding, _query, signal) {
      yield { type: 'message.block.completed', block: { type: 'ask_question', status: 'pending', toolUseId: 'q1', questions: [] } };
      await new Promise<void>(resolve => {
        if (signal.aborted) { aborted = true; resolve(); }
        else signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
      });
    },
  });
  const request = input(); request.input.limits.timeoutMs = 1000; f.core.prepare(request);
  await until(() => f.core.get(request.runId).status === 'ready'); f.core.start(request.runId);
  await until(() => f.core.get(request.runId).status === 'waiting_user');
  assert.equal(f.core.get(request.runId).pendingQuestion!.toolUseId, 'q1');
  await until(() => f.core.get(request.runId).status === 'timed_out');
  assert.equal(aborted, true);
  assert.equal((await f.core.cleanup(request.runId)).cleanup, 'completed');
});

test('missing or rejected completion cannot become a successful rollout', async t => {
  for (const events of [[], [{ type: 'message.completed', status: 'done', accepted: false }], [{ type: 'message.completed', status: 'done', raw: { fallback: true } }], [{ type: 'error' }]]) {
    const f = await fixture(t, { execute: async function* () { yield* events; } });
    const request = input(); f.core.prepare(request);
    await until(() => f.core.get(request.runId).status === 'ready'); f.core.start(request.runId);
    await until(() => f.core.get(request.runId).status === 'failed');
    assert.equal(f.core.get(request.runId).error, 'execution_failed');
    await f.core.cleanup(request.runId);
  }
});

test('backend validates paths independently before allocating any user', async t => {
  const f = await fixture(t);
  for (const path of ['../escape', 'C:/escape', 'a\\b', 'nul', '/escape']) {
    const request = input(); request.input.workspace.files[0]!.path = path;
    assert.throws(() => f.core.prepare(request), /path/);
  }
  assert.equal(f.profiles.size, 0);
  assert.throws(() => validateTrainingInput({}), /identity/);
});

test('Gateway and HTTP harness adapter run a task through the real core and filesystem', async t => {
  const f = await fixture(t);
  const backend = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401).end(); return; }
    try {
      let result;
      const path = new URL(req.url!, 'http://local').pathname;
      const id = path.split('/')[2]!;
      if (req.method === 'POST' && path === '/runs') {
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
        result = f.core.prepare(JSON.parse(Buffer.concat(chunks).toString()));
      } else if (path.endsWith('/start')) result = f.core.start(id);
      else if (path.endsWith('/cancel')) result = await f.core.cancel(id);
      else if (req.method === 'DELETE') result = await f.core.cleanup(id);
      else result = f.core.get(id);
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result));
    } catch { res.writeHead(400).end('{}'); }
  });
  const backendUrl = await listen(backend, t);
  const gateway = createGatewayServer({ ...loadConfig({}), harnessUrl: backendUrl, harnessToken: 'test-token' });
  const base = await listen(gateway, t);
  t.after(() => gateway.shutdownHarness());
  const response = await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input().input) });
  assert.equal(response.status, 201);
  const run = await response.json();
  assert.equal(run.execution.available, true);
  await until(async () => (await (await fetch(`${base}/v1/runs/${run.runId}`)).json()).status === 'completed');
  const complete = await (await fetch(`${base}/v1/runs/${run.runId}`)).json();
  assert.ok(complete.harness.userId > 0);
  assert.equal(complete.initialFiles.length, 1);
  assert.equal(complete.reply, 'read input');
  const cleaned = await (await fetch(`${base}/v1/runs/${run.runId}`, { method: 'DELETE' })).json();
  assert.equal(cleaned.cleanup, 'completed');
  await assert.rejects(() => lstat(complete.harness.workspaceRoot));
  const wrongClient = new HttpHarnessClient(backendUrl, 'wrong');
  await assert.rejects(() => wrongClient.get(run.runId), /401/);
});
