import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { RunStore } from '../src/sessions/run-store.ts';
import { validateCreateRun } from '../src/api/validation.ts';
import { ModelProxy } from '../src/proxy/model-proxy.ts';
import { decodeResponse } from '../src/proxy/response.ts';
import { createTrainingFetch, classifyTrainingCall, reportTrainingToolResults } from '../../CrescoAI-Backend/backend/src/services/api/trainingTransport.ts';

async function listen(server: Server, t: TestContext) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function fixture(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void, provider: 'openai' | 'anthropic' = 'openai', limit = 10) {
  const root = await mkdtemp(join(tmpdir(), 'gateway-proxy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = await listen(createServer(handler), t);
  const config = { ...loadConfig({}), traceDir: root, publicUrl: 'http://127.0.0.1', models: { policy: { provider, baseUrl: upstream, model: 'training-model', apiKey: 'SECRET-UPSTREAM-KEY' } } };
  const store = new RunStore();
  const run = store.create(validateCreateRun({ taskId: 'proxy-task', query: 'hello', profile: {}, modelProfile: 'policy', limits: { maxModelCalls: limit } }));
  store.update(run.runId, { status: 'running' });
  const proxy = new ModelProxy(config, store);
  let route: ReturnType<ModelProxy['register']>;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.url?.endsWith('/events')) { const result = await proxy.toolResult(run.gatewaySessionId, req, body); res.end(JSON.stringify(result)); }
      else await proxy.handle(run.gatewaySessionId, provider, req, res, body);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead((error as { status?: number }).status ?? 500); res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  config.publicUrl = await listen(server, t);
  route = proxy.register(run);
  const transport = { ...route, runId: run.runId, gatewaySessionId: run.gatewaySessionId, rootConversationId: 'root-session' };
  const endpoint = `${route.baseUrl}/v1/${provider === 'openai' ? 'chat/completions' : 'messages'}`;
  const request = (body: unknown, source = 'sdk', child?: string) => createTrainingFetch(transport, 'root-session', source, () => child)(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { proxy, run, request, endpoint, transport, root, store };
}
const completion = { choices: [{ message: { role: 'assistant', content: '你好' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } };

test('native HTTP requests capture exact main input/response and exclude subagent and auxiliary content', async t => {
  const forwarded: any[] = [];
  const correlation: Array<{ run: unknown; request: unknown }> = [];
  const f = await fixture(t, async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer SECRET-UPSTREAM-KEY');
    assert.equal(req.headers['x-training-agent-id'], undefined);
    correlation.push({ run: req.headers['x-gateway-run-id'], request: req.headers['x-gateway-request-id'] });
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    forwarded.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(completion));
  });
  const body = { model: 'training-model', messages: [{ role: 'system', content: 'Profile + Auto Memory retained' }, { role: 'user', content: 'Query' }], tools: [], temperature: 0.2 };
  assert.equal((await f.request(body)).status, 200);
  await f.request({ ...body, messages: [{ role: 'user', content: 'CHILD-PRIVATE' }] }, 'sdk', 'skill-child');
  await f.request({ ...body, messages: [{ role: 'user', content: 'COMPACT-PRIVATE' }] }, 'compact');
  const events = await f.proxy.traces.read(f.run.runId) as any[];
  assert.equal(forwarded.length, 3);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].body, forwarded[0]);
  assert.deepEqual(events[1].response.message, completion.choices[0]!.message);
  assert.deepEqual(events[1].response.usage, completion.usage);
  assert.equal(events[1].complete, true);
  const log = await readFile(join(f.root, `${f.run.runId}.events.jsonl`), 'utf8');
  for (const secret of ['SECRET-UPSTREAM-KEY', f.transport.token, 'CHILD-PRIVATE', 'COMPACT-PRIVATE']) assert.ok(!log.includes(secret));
  assert.equal(correlation[0]!.run, f.run.runId);
  assert.equal(correlation[0]!.request, events[0].identity.requestId);
  assert.deepEqual(correlation.slice(1), [{ run: undefined, request: undefined }, { run: undefined, request: undefined }]);
  await f.proxy.traces.ingest(f.run.runId, f.run.gatewaySessionId, {
    schemaVersion: '1.0', eventId: 'engine-tokens', runId: f.run.runId, occurredAt: new Date().toISOString(),
    payload: { type: 'training.tokens', requestId: correlation[0]!.request, tokens: {
      source: 'inference_engine', modelVersion: 'mock-engine-v1', tokenizerVersion: 'mock-tokenizer-v1',
      tokenIds: [1, 2, 3, 4, 5, 6, 7], promptTokenCount: 5, lossMask: [0, 0, 0, 0, 0, 1, 1], logprobs: [null, null, null, null, null, -0.1, -0.2],
    } },
  });
  assert.equal((await f.proxy.traces.finalize(f.run.runId, { ...f.run, status: 'completed' })).trainingReady, true);
});

test('OpenAI split UTF-8 SSE captures tool arguments and the final standalone tool result', async t => {
  const events = [
    { choices: [{ index: 0, delta: { content: '你好', tool_calls: [{ index: 0, id: 'tool-main', function: { name: 'SkillTool', arguments: '{"q":' } }] }, finish_reason: null }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"job"}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10 } },
  ];
  const raw = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  const f = await fixture(t, (_req, res) => {
    res.setHeader('content-type', 'text/event-stream');
    const bytes = Buffer.from(raw); for (let i = 0; i < bytes.length; i += 7) res.write(bytes.subarray(i, i + 7)); res.end();
  });
  assert.equal(await (await f.request({ stream: true, messages: [] })).text(), raw);
  const sdkMessage = { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'tool-main', content: [{ type: 'text', text: '最终技能结果' }], is_error: false }] } };
  await Promise.all([reportTrainingToolResults(f.transport, sdkMessage), reportTrainingToolResults(f.transport, sdkMessage)]);
  await reportTrainingToolResults(f.transport, { ...sdkMessage, parent_tool_use_id: 'parent-tool' });
  const trace = await f.proxy.traces.read(f.run.runId) as any[];
  assert.deepEqual(trace.map(e => e.type), ['model.request', 'model.response', 'tool.call', 'tool.result']);
  assert.equal(trace[1].response.message.tool_calls[0].function.arguments, '{"q":"job"}');
  assert.equal(trace[1].response.message.content, '你好');
  assert.deepEqual(trace[3].content, sdkMessage.message.content[0]!.content);
  assert.equal(trace[1].rawBody, raw);
  await assert.rejects(() => reportTrainingToolResults(f.transport, { ...sdkMessage, message: { content: [{ ...sdkMessage.message.content[0], content: 'conflicting result' }] } }), /capture failed/);
});

test('Anthropic SSE assembles thinking, tool inputs and usage while preserving raw stream', async t => {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 8 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'visible reasoning' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'ask-1', name: 'Ask_User_Question', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"questions":[]}' } },
    { type: 'message_delta', usage: { output_tokens: 5 } }, { type: 'message_stop' },
  ];
  const raw = events.map(e => `event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join('');
  const f = await fixture(t, (req, res) => {
    assert.equal(req.headers['x-api-key'], 'SECRET-UPSTREAM-KEY');
    res.setHeader('content-type', 'text/event-stream'); res.end(raw);
  }, 'anthropic');
  assert.equal(await (await f.request({ stream: true, messages: [], max_tokens: 100 })).text(), raw);
  const trace = await f.proxy.traces.read(f.run.runId) as any[];
  assert.equal(trace[1].complete, true);
  assert.deepEqual(trace[1].response.usage, { input_tokens: 8, output_tokens: 5 });
  assert.deepEqual(trace[1].response.message.content[1].input, { questions: [] });
});

test('model limit is atomic and only consumes main attempts; memory markers never reach upstream or trace', async t => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => { calls++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(completion)); }, 'openai', 1);
  const rejected = await f.request({ messages: [{ role: 'system', content: '<conversation_memory>secret instruction</conversation_memory>' }] });
  assert.equal(rejected.status, 400); assert.equal(calls, 0);
  const pair = await Promise.all([f.request({ messages: [] }), f.request({ messages: [] })]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 429]);
  assert.equal((await f.request({ messages: [] }, 'agent:skill', 'child-1')).status, 200);
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(await f.proxy.traces.read(f.run.runId)).includes('secret instruction'));
});

test('missing identity and unknown tool results are rejected', async t => {
  const f = await fixture(t, (_req, res) => { res.end(JSON.stringify(completion)); });
  const response = await fetch(f.endpoint, { method: 'POST', headers: { authorization: `Bearer ${f.transport.token}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 400);
  await assert.rejects(() => reportTrainingToolResults(f.transport, { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 'child-only', content: 'excluded' }] } }), /capture failed/);
  assert.deepEqual(await f.proxy.traces.read(f.run.runId), []);
});

test('capture failure never releases the terminal SSE completion frame', async t => {
  const raw = 'data: {"choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  const f = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end(raw); });
  const append = f.proxy.traces.append.bind(f.proxy.traces);
  f.proxy.traces.append = (id, event) => event.type === 'model.response' ? Promise.reject(new Error('disk full')) : append(id, event);
  let text = '';
  await assert.rejects(async () => {
    const response = await f.request({ stream: true });
    for await (const chunk of response.body!) text += Buffer.from(chunk).toString('utf8');
  });
  assert.ok(!text.includes('[DONE]'));
});

test('closed sessions reject new calls and do not reuse another session credential', async t => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => { calls++; res.end(JSON.stringify(completion)); });
  const wrong = createTrainingFetch({ ...f.transport, token: 'another-session-token' }, 'root-session', 'sdk', () => undefined);
  assert.equal((await wrong(f.endpoint, { method: 'POST', body: '{}' })).status, 401);
  await f.proxy.stopRun(f.run.runId);
  assert.equal((await f.request({})).status, 409);
  assert.equal(calls, 0);
});

test('truncated streams stay incomplete and HTTP errors preserve status without inventing a completion', async t => {
  const f = await fixture(t, (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'); });
  await assert.rejects(async () => { const result = await f.request({ stream: true }); await result.text(); });
  const trace = await f.proxy.traces.read(f.run.runId) as any[];
  assert.equal(trace[1].complete, false);
  const g = await fixture(t, (_req, res) => { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"unavailable"}'); });
  const response = await g.request({ messages: [] }); assert.equal(response.status, 503); await response.text();
  assert.equal((await g.proxy.traces.read(g.run.runId) as any[])[1].complete, false);
});

test('classification excludes same-source child calls and profile jobs and does not guess unknown sources', () => {
  const transport = { runId: 'r', gatewaySessionId: 'g', rootConversationId: 'root', baseUrl: '', token: '' };
  assert.equal(classifyTrainingCall('sdk', undefined, 'root', transport).role, 'main');
  assert.equal(classifyTrainingCall('sdk', 'child', 'root', transport).role, 'subagent');
  assert.equal(classifyTrainingCall('sdk', undefined, 'profile-refresh', transport).role, 'auxiliary');
  assert.equal(classifyTrainingCall(undefined, undefined, 'root', transport).role, 'auxiliary');
  assert.equal(decodeResponse('anthropic', 'data: [DONE]\n\n', true).complete, false);
});

test('Gateway public router exposes configured capabilities and diagnostic trace without session credentials', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gateway-api-proxy-')); t.after(() => rm(root, { recursive: true, force: true }));
  const server = createGatewayServer({ ...loadConfig({}), publicUrl: 'http://127.0.0.1:8787', traceDir: root, models: { policy: { provider: 'openai', model: 'm', baseUrl: 'http://127.0.0.1:8000', apiKey: 'secret' } } });
  const base = await listen(server, t);
  const cap = await (await fetch(`${base}/v1/capabilities`)).json(); assert.equal(cap.capabilities.mainAgentCapture, true);
  const run = await (await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 't', profile: {}, query: 'q', modelProfile: 'policy' }) })).json();
  assert.ok(!JSON.stringify(run).includes('secret'));
  assert.deepEqual(await (await fetch(`${base}/v1/runs/${run.runId}/trace`)).json(), { events: [], format: 'diagnostic', trainingReady: false });
});

test('task creation hands the private session route to harness and records a round trip through public proxy routes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gateway-route-e2e-')); t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = await listen(createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(completion)); }), t);
  let prepared: any; let state = 'ready';
  const snapshot = () => ({ runId: prepared.runId, gatewaySessionId: prepared.gatewaySessionId, status: state, harness: { userId: 1, conversationId: 'root-session', workspaceRoot: root }, initialFiles: [], error: null, reply: state === 'completed' ? '你好' : null, cleanup: 'not_requested', pendingQuestion: null });
  const harness = await listen(createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer harness-secret');
    if (req.url === '/runs') {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      prepared = JSON.parse(Buffer.concat(chunks).toString());
    } else if (req.url?.endsWith('/start')) {
      const transport = { ...prepared.gateway, runId: prepared.runId, gatewaySessionId: prepared.gatewaySessionId, rootConversationId: 'root-session' };
      const wireFetch = createTrainingFetch(transport, 'root-session', 'sdk', () => undefined);
      const result = await wireFetch(`${transport.baseUrl}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prepared.input.query }], model: prepared.gateway.model }) });
      assert.equal(result.status, 200); await result.text(); state = 'completed';
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(snapshot()));
  }), t);
  const config = { ...loadConfig({}), publicUrl: 'http://127.0.0.1', traceDir: root, harnessUrl: harness, harnessToken: 'harness-secret', models: { policy: { provider: 'openai' as const, model: 'm', baseUrl: upstream, apiKey: 'upstream-secret' } } };
  const gateway = createGatewayServer(config); config.publicUrl = await listen(gateway, t);
  t.after(() => gateway.shutdownHarness());
  const run = await (await fetch(`${config.publicUrl}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'e2e', profile: {}, query: 'Query', modelProfile: 'policy' }) })).json();
  const deadline = Date.now() + 3000;
  while ((await (await fetch(`${config.publicUrl}/v1/runs/${run.runId}`)).json()).status !== 'completed') {
    if (Date.now() > deadline) throw new Error('Harness round trip timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(prepared.gateway.model, 'm');
  assert.ok(!JSON.stringify(run).includes(prepared.gateway.token));
  const trace = await (await fetch(`${config.publicUrl}/v1/runs/${run.runId}/trace`)).json();
  assert.deepEqual(trace.events.map((e: any) => e.type), ['model.request', 'model.response']);
  assert.equal(trace.events[0].body.messages[0].content, 'Query');
  assert.equal(trace.events[1].complete, true);
});
