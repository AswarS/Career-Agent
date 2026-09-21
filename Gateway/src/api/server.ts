import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { GatewayConfig } from '../config.ts';
import { SCHEMA_VERSION } from '../contracts.ts';
import { RunStore } from '../sessions/run-store.ts';
import { ApiError, validateCreateRun } from './validation.ts';
import { HttpHarnessClient } from '../harness/client.ts';
import { HarnessRunner } from '../harness/runner.ts';
import type { HarnessClient } from '../harness/client.ts';
import { ModelProxy } from '../proxy/model-proxy.ts';
import { UserSimulator } from '../user-simulator/simulator.ts';
import { TraceStore } from '../trajectories/trace-store.ts';
import { fileURLToPath } from 'node:url';

const capabilities = {
  taskRegistration: true,
  harnessExecution: false,
  persistentStorage: false,
  modelProxy: false,
  trajectoryIngest: false,
  trajectoryExport: false,
  userSimulator: false,
  trainingTokens: false,
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw new ApiError(415, 'unsupported_encoding', 'Compressed request bodies are not supported');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) {
      req.resume();
      throw new ApiError(413, 'body_too_large', `Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON'); }
}

function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const actual = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createGatewayServer(config: GatewayConfig, store = new RunStore(config.maxRuns, Boolean(config.harnessUrl)), client?: HarnessClient) {
  const traces = new TraceStore(config.traceDir ?? fileURLToPath(new URL('../../data/trajectories', import.meta.url)));
  const proxy = config.publicUrl && Object.keys(config.models ?? {}).length ? new ModelProxy(config, store, traces) : undefined;
  const adapter = client ?? (config.harnessUrl && config.harnessToken ? new HttpHarnessClient(config.harnessUrl, config.harnessToken, proxy ? run => proxy.route(run) : undefined) : undefined);
  const simulator = new UserSimulator(config.userModels ?? {});
  const runner = adapter ? new HarnessRunner(store, adapter, 250, simulator, (id, event) => traces.append(id, event)) : undefined;
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId);
    try {
      const path = new URL(req.url ?? '/', 'http://gateway.local').pathname;
      if (req.method === 'GET' && path === '/healthz') {
        send(res, 200, { status: 'ok', service: 'career-agent-training-gateway', phase: 6 });
        return;
      }
      const sessionRoute = /^\/sessions\/([a-f0-9-]{36})\/(v1\/(chat\/completions|messages)|events)$/.exec(path);
      if (sessionRoute && req.method === 'POST' && proxy) {
        const body = await readJson(req, config.maxModelBodyBytes ?? config.maxBodyBytes);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_request', 'Object required');
        if (sessionRoute[2] === 'events') send(res, 200, await proxy.toolResult(sessionRoute[1]!, req, body as Record<string, unknown>));
        else await proxy.handle(sessionRoute[1]!, sessionRoute[3] === 'messages' ? 'anthropic' : 'openai', req, res, body as Record<string, unknown>);
        return;
      }
      if (!authorized(req, config.apiToken)) throw new ApiError(401, 'unauthorized', 'Valid Bearer token required');
      if (req.method === 'GET' && path === '/v1/readiness') {
        let backend = null;
        try { backend = await adapter?.readiness?.() ?? null; } catch { /* Fixed failure fields only. */ }
        send(res, 200, { ready: Boolean(backend?.implementation === 'career-agent-nestjs' && backend.protocolVersion === 1 && backend.databaseReachable && proxy), backend, modelApiProbed: false }); return;
      }
      if (req.method === 'GET' && path === '/v1/capabilities') {
        send(res, 200, { schemaVersion: SCHEMA_VERSION, phase: 6, capabilities: { ...capabilities, harnessExecution: Boolean(runner), modelProxy: Boolean(proxy), mainAgentCapture: Boolean(proxy), userSimulator: Boolean(runner && Object.keys(config.userModels ?? {}).length), userTerminal: Boolean(runner), trajectoryIngest: true, trajectoryExport: true, trajectoryFinalization: true, durableTrajectoryStorage: true, trainingTokenIngest: true } });
      } else if (req.method === 'POST' && path === '/v1/runs') {
        const input = validateCreateRun(await readJson(req, config.maxBodyBytes));
        if (runner && input.userSimulator && !simulator.has(input.userSimulator.modelProfile)) throw new ApiError(400, 'unknown_user_simulator_model', 'Configure the requested user simulator model');
        if (proxy && !Object.hasOwn(config.models!, input.modelProfile)) throw new ApiError(400, 'unknown_model_profile', 'Unknown Gateway model profile');
        const run = store.create(input);
        proxy?.register(run);
        runner?.launch(run.runId);
        res.setHeader('location', `/v1/runs/${run.runId}`);
        send(res, 201, store.get(run.runId));
      } else {
        const trajectoryRoute = /^\/v1\/runs\/([a-f0-9-]{36})\/(trajectory-events|trajectory|finalize)$/.exec(path);
        if (trajectoryRoute) {
          const id = trajectoryRoute[1]!, action = trajectoryRoute[2];
          if (action === 'trajectory' && req.method === 'GET') {
            const format = new URL(req.url!, 'http://gateway.local').searchParams.get('format') ?? 'events';
            if (format !== 'events' && format !== 'messages' && format !== 'messages_list') throw new ApiError(400, 'invalid_format', 'Use events, messages or messages_list');
            send(res, 200, await traces.export(id, format)); return;
          }
          if (action === 'trajectory-events' && req.method === 'GET') {
            try { store.get(id); } catch { await traces.export(id); }
            const params = new URL(req.url!, 'http://gateway.local').searchParams;
            const afterText = params.get('after') ?? String(req.headers['last-event-id'] ?? '0');
            const limitText = params.get('limit') ?? '1000';
            const after = Number(afterText), limit = Number(limitText);
            if (!/^\d+$/.test(afterText) || !Number.isSafeInteger(after) || !/^\d+$/.test(limitText) || limit < 1 || limit > 1000) throw new ApiError(400, 'invalid_cursor', 'after must be a sequence and limit must be 1..1000');
            const page = await traces.events(id, after, limit);
            if (req.headers.accept?.includes('text/event-stream')) {
              res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
              for (const event of page.events) {
                if (!res.write(`id: ${event.sequence}\nevent: trajectory\ndata: ${JSON.stringify(event)}\n\n`)) {
                  await new Promise<void>(resolve => { const done = () => { res.removeListener('drain', done); res.removeListener('close', done); resolve(); }; res.once('drain', done); res.once('close', done); });
                  if (res.destroyed) return;
                }
              }
              res.end(`event: checkpoint\ndata: ${JSON.stringify({ nextCursor: page.nextCursor, finalized: page.finalized })}\n\n`);
            } else send(res, 200, page);
            return;
          }
          if (action === 'trajectory-events' && req.method === 'POST') {
            let sessionId: string;
            try { sessionId = store.get(id).gatewaySessionId; }
            catch { const saved = await traces.export(id); if (!saved.manifest) throw new ApiError(409, 'run_not_recovered', 'Only sealed archives can be accessed after restart'); sessionId = saved.manifest.gatewaySessionId; }
            send(res, 200, await traces.ingest(id, sessionId, await readJson(req, config.maxModelBodyBytes ?? config.maxBodyBytes))); return;
          }
          if (action === 'finalize' && req.method === 'POST') {
            let run;
            try { run = store.get(id); }
            catch { const saved = await traces.export(id); if (saved.manifest) { send(res, 200, saved.manifest); return; } throw new ApiError(409, 'run_not_recovered', 'Run state is unavailable'); }
            if (!['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) throw new ApiError(409, 'run_not_terminal', 'Finish or cancel the run before finalizing');
            await runner?.drain(id); await proxy?.stopRun(id);
            send(res, 200, await traces.finalize(id, store.get(id))); return;
          }
        }
        const questionRoute = /^\/v1\/runs\/([a-f0-9-]{36})\/user-questions\/([^/]+)\/respond$/.exec(path);
        if (questionRoute && req.method === 'POST' && runner) {
          const body = await readJson(req, config.maxBodyBytes);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'invalid_answers', 'Object required');
          await runner.respond(questionRoute[1]!, decodeURIComponent(questionRoute[2]!), (body as { answers?: unknown }).answers);
          send(res, 200, store.get(questionRoute[1]!)); return;
        }
        const traceRoute = /^\/v1\/runs\/([a-f0-9-]{36})\/trace$/.exec(path);
        if (traceRoute && req.method === 'GET' && proxy) {
          store.get(traceRoute[1]!);
          send(res, 200, { events: await proxy.traces.read(traceRoute[1]!), format: 'diagnostic', trainingReady: false }); return;
        }
        const match = /^\/v1\/runs\/([a-f0-9-]{36})(?:\/(cancel))?$/.exec(path);
        if (match && !match[2] && req.method === 'GET') send(res, 200, store.get(match[1]!));
        else if (match?.[2] === 'cancel' && req.method === 'POST') {
          await proxy?.stopRun(match[1]!);
          send(res, 200, runner ? await runner.cancel(match[1]!) : store.cancel(match[1]!));
        }
        else if (match && !match[2] && req.method === 'DELETE' && runner) send(res, 200, await runner.cleanup(match[1]!));
        else throw new ApiError(404, 'route_not_found', 'Route does not exist; see /v1/capabilities');
      }
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      const known = error instanceof ApiError;
      if (known && error.status === 413) res.setHeader('connection', 'close');
      send(res, known ? error.status : 500, {
        error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Internal gateway error', requestId },
      });
    }
  });
  return Object.assign(server, { shutdownHarness: () => runner?.shutdown() ?? Promise.resolve() });
}
