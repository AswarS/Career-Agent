import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createGatewayServer } from '../src/api/server.ts';
import { validateCreateRun } from '../src/api/validation.ts';
import { loadConfig } from '../src/config.ts';
import type { GatewayConfig } from '../src/config.ts';
import { RunStore } from '../src/sessions/run-store.ts';

const sample = JSON.parse(await readFile(new URL('../examples/task.json', import.meta.url), 'utf8'));

async function fixture(overrides: Partial<GatewayConfig> = {}) {
  const config = { ...loadConfig({}), port: 0, ...overrides };
  const server = createGatewayServer(config);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
    post: (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    }),
  };
}

test('HTTP task registration isolates repeated samples and reports execution unavailable', async t => {
  const app = await fixture();
  t.after(app.close);
  const response = await app.post('/v1/runs', sample);
  assert.equal(response.status, 201);
  const first = await response.json();
  assert.equal(response.headers.get('location'), `/v1/runs/${first.runId}`);
  assert.equal(first.status, 'created');
  assert.equal(first.harness, null);
  assert.equal(first.execution.available, false);
  assert.deepEqual(first.policy, { conversationMemory: false, captureAgentRole: 'main', otherBackendFeatures: 'inherit' });
  const second = await (await app.post('/v1/runs', sample)).json();
  assert.equal(second.taskId, first.taskId);
  assert.notEqual(second.runId, first.runId);
  assert.notEqual(second.gatewaySessionId, first.gatewaySessionId);
  const fetched = await (await fetch(`${app.base}/v1/runs/${first.runId}`)).json();
  assert.deepEqual(fetched.input, sample);
  assert.equal((await app.post(`/v1/runs/${first.runId}/cancel`, {})).status, 200);
  const cancelled = await (await app.post(`/v1/runs/${first.runId}/cancel`, {})).json();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((await (await fetch(`${app.base}/v1/runs/${second.runId}`)).json()).status, 'created');
});

test('capabilities and nonexistent future routes do not claim implemented training', async t => {
  const app = await fixture();
  t.after(app.close);
  assert.equal((await fetch(`${app.base}/healthz`)).status, 200);
  const result = await (await fetch(`${app.base}/v1/capabilities`)).json();
  assert.equal(result.capabilities.taskRegistration, true);
  for (const [key, value] of Object.entries(result.capabilities)) {
    assert.equal(value, ['taskRegistration', 'trajectoryIngest', 'trajectoryExport', 'trajectoryFinalization', 'durableTrajectoryStorage', 'trainingTokenIngest'].includes(key));
  }
  const response = await fetch(`${app.base}/v1/runs/00000000-0000-0000-0000-000000000000`);
  assert.equal(response.status, 404);
  const error = (await response.json()).error;
  assert.equal(error.code, 'run_not_found');
  assert.equal(error.requestId, response.headers.get('x-request-id'));
  assert.equal((await app.post('/v1/runs/test/trajectory-events', {})).status, 404);
});

test('service credential protects all non-health routes', async t => {
  const app = await fixture({ apiToken: 'test-service-token' });
  t.after(app.close);
  assert.equal((await fetch(`${app.base}/healthz`)).status, 200);
  assert.equal((await fetch(`${app.base}/v1/capabilities`)).status, 401);
  assert.equal((await app.post('/v1/runs', sample)).status, 401);
  assert.equal((await app.post('/v1/runs', sample, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await app.post('/v1/runs', sample, { authorization: 'Bearer test-service-token' })).status, 201);
});

test('HTTP rejects malformed, unsupported and oversized input without stopping the service', async t => {
  const app = await fixture({ maxBodyBytes: 2048 });
  t.after(app.close);
  const malformed = await fetch(`${app.base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'invalid_json');
  assert.equal((await fetch(`${app.base}/v1/runs`, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await app.post('/v1/runs', { ...sample, query: 'x'.repeat(3000) })).status, 413);
  assert.equal((await app.post('/v1/runs', { ...sample, profile: [] })).status, 400);
  assert.equal((await app.post('/v1/runs', { ...sample, policy: { conversationMemory: true } })).status, 400);
  assert.equal((await app.post('/v1/runs', sample)).status, 201);
});

test('workspace validation prevents portable-path conflicts and traversal', () => {
  const withPaths = (paths: string[]) => ({ ...sample, workspace: { files: paths.map(path => ({ path, content: '' })) } });
  for (const path of ['../secret', '/root/file', 'C:/file', 'a\\b', 'a/../b', 'a//b', 'nul.txt', 'a:stream', 'a.', 'a\u0000b']) {
    assert.throws(() => validateCreateRun(withPaths([path])), /path/);
  }
  for (const paths of [['a', 'A'], ['a', 'a/b'], ['a/b', 'a']]) assert.throws(() => validateCreateRun(withPaths(paths)), /conflict/);
  assert.equal(validateCreateRun(withPaths(['资料/简历.md'])).workspace.files[0]!.encoding, 'utf8');
  assert.throws(() => validateCreateRun({ ...sample, workspace: { files: [{ path: 'a', content: '$notbase64', encoding: 'base64' }] } }), /base64/);
});

test('input defaults, bounded limits and store cloning prevent state contamination', () => {
  const input = validateCreateRun({ taskId: 'minimal', profile: {}, query: 'help', modelProfile: 'main' });
  assert.equal(input.limits.maxModelCalls, 100);
  assert.equal(input.userSimulator, null);
  const store = new RunStore(1);
  const run = store.create(input);
  input.profile.name = 'changed';
  run.input.query = 'changed';
  assert.equal(store.get(run.runId).input.query, 'help');
  assert.deepEqual(store.get(run.runId).input.profile, {});
  assert.throws(() => store.create(input), /capacity/);
  assert.throws(() => validateCreateRun({ ...sample, limits: { timeoutMs: -1 } }), /timeoutMs/);
  assert.throws(() => validateCreateRun({ ...sample, limits: { maxModelCalls: 1.5 } }), /maxModelCalls/);
  assert.throws(() => validateCreateRun({ ...sample, workspace: { files: null } }), /files/);
});

test('configuration refuses unprotected remote binding and invalid numbers', () => {
  assert.equal(loadConfig({}).host, '127.0.0.1');
  assert.throws(() => loadConfig({ GATEWAY_HOST: '0.0.0.0' }), /TOKEN/);
  assert.equal(loadConfig({ GATEWAY_HOST: '0.0.0.0', GATEWAY_API_TOKEN: 'test' }).host, '0.0.0.0');
  for (const port of ['0', '-1', '65536', '8787junk']) assert.throws(() => loadConfig({ GATEWAY_PORT: port }), /PORT/);
});
