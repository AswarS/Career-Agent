import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RunRecord } from '../contracts.ts';
import type { GatewayConfig, ModelProfile } from '../config.ts';
import { RunStore } from '../sessions/run-store.ts';
import { TraceStore } from '../trajectories/trace-store.ts';
import { ApiError } from '../api/validation.ts';
import { decodeResponse, toolCalls } from './response.ts';
import type { Protocol } from './response.ts';

export interface GatewayRoute { baseUrl: string; token: string; provider: Protocol; model: string }
interface Session {
  runId: string; id: string; token: string; model: ModelProfile; calls: number;
  active: Set<Promise<void>>; controllers: Set<AbortController>;
  tools: Set<string>; results: Map<string, { signature: string; write: Promise<void> }>;
  closed?: boolean;
}

export class ModelProxy {
  private sessions = new Map<string, Session>();
  private config: GatewayConfig; private runs: RunStore;
  readonly traces: TraceStore;
  constructor(config: GatewayConfig, runs: RunStore, traces?: TraceStore) {
    this.config = config; this.runs = runs; this.traces = traces ?? new TraceStore(config.traceDir!);
  }
  register(run: RunRecord): GatewayRoute {
    const model = this.config.models?.[run.input.modelProfile];
    if (!model) throw new ApiError(400, 'unknown_model_profile', 'No Gateway model profile configured for this task');
    const session: Session = { runId: run.runId, id: run.gatewaySessionId, token: randomUUID(), model, calls: 0, active: new Set(), controllers: new Set(), tools: new Set(), results: new Map() };
    this.sessions.set(session.id, session);
    return this.route(run);
  }
  route(run: RunRecord): GatewayRoute {
    const session = this.sessions.get(run.gatewaySessionId)!;
    return { baseUrl: `${this.config.publicUrl}/sessions/${session.id}`, token: session.token, provider: session.model.provider, model: session.model.model };
  }
  private authorize(id: string, req: IncomingMessage) {
    const session = this.sessions.get(id);
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.headers['x-api-key'];
    const actual = Buffer.from(typeof token === 'string' ? token : '');
    const expected = Buffer.from(session?.token ?? randomUUID());
    if (!session || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, 'invalid_session_token', 'Valid session credential required');
    if (session.closed) throw new ApiError(409, 'inactive_run', 'Model session is closed');
    if (!['preparing', 'running', 'waiting_user'].includes(this.runs.get(session.runId).status)) throw new ApiError(409, 'inactive_run', 'Model session is not active');
    return session;
  }
  async stopRun(runId: string) {
    for (const s of this.sessions.values()) if (s.runId === runId) {
      s.closed = true;
      for (const controller of s.controllers) controller.abort();
      await Promise.allSettled([...s.active]);
    }
  }
  async handle(id: string, protocol: Protocol, req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>) {
    const s = this.authorize(id, req);
    if (s.model.provider !== protocol) throw new ApiError(400, 'protocol_mismatch', 'Session uses a different model protocol');
    const role = req.headers['x-training-agent-role'];
    const agentId = req.headers['x-training-agent-id'];
    const purpose = req.headers['x-training-purpose'];
    const parentAgentId = req.headers['x-training-parent-agent-id'];
    if (!['main', 'subagent', 'auxiliary'].includes(String(role)) || typeof agentId !== 'string' || !agentId || typeof purpose !== 'string') throw new ApiError(400, 'missing_call_identity', 'Explicit agent identity is required');
    const main = role === 'main' && purpose === 'policy' && agentId === `main:${s.id}` && !parentAgentId;
    if (role === 'main' && !main) throw new ApiError(400, 'invalid_main_identity', 'Invalid main policy identity');
    if (body.n !== undefined && body.n !== 1) throw new ApiError(400, 'unsupported_sampling', 'Use a separate run for each sample');
    // Never silently rewrite training input. Reject framework memory markers before forwarding or recording.
    if (/<\/?conversation_memory>|<career-agent:conversation-memory-checkpoint>|career-agent:conversation-memory:start/.test(JSON.stringify(body))) {
      await this.traces.append(s.runId, { type: 'capture.rejected', reason: 'conversation_memory_marker' });
      throw new ApiError(400, 'conversation_memory_detected', 'Disabled memory instructions reached the model boundary');
    }
    const identity = { gatewaySessionId: s.id, requestId: randomUUID(), agentId, parentAgentId: parentAgentId ?? null, agentRole: role, purpose, source: req.headers['x-training-source'] ?? null, modelCallId: req.headers['x-training-call-id'] ?? null, attempt: Number(req.headers['x-training-attempt'] ?? 1) };
    if (main && s.calls >= this.runs.get(s.runId).input.limits.maxModelCalls) {
      await this.traces.append(s.runId, { type: 'limit.exceeded', limit: 'maxModelCalls' });
      throw new ApiError(429, 'model_call_limit', 'Main Agent model call limit reached');
    }
    // Policy is enforced before any await, including concurrent calls and retries.
    if (main) s.calls++;
    const upstreamBody = { ...body, model: typeof body.model === 'string' ? body.model : s.model.model };
    const controller = new AbortController(); s.controllers.add(controller);
    let settle!: () => void;
    const pending = new Promise<void>(resolve => { settle = resolve; }); s.active.add(pending);
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', close);
    const timeout = setTimeout(() => controller.abort(), this.runs.get(s.runId).input.limits.timeoutMs);
    let raw = ''; let status: number | null = null; let recorded = false;
    const startedAt = Date.now();
    try {
      if (main) await this.traces.append(s.runId, { type: 'model.request', identity, protocol, body: upstreamBody });
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (main) { headers['x-gateway-request-id'] = identity.requestId; headers['x-gateway-run-id'] = s.runId; }
      if (protocol === 'openai') headers.authorization = `Bearer ${s.model.apiKey}`;
      else {
        headers['x-api-key'] = s.model.apiKey;
        headers['anthropic-version'] = typeof req.headers['anthropic-version'] === 'string' ? req.headers['anthropic-version'] : '2023-06-01';
        if (typeof req.headers['anthropic-beta'] === 'string') headers['anthropic-beta'] = req.headers['anthropic-beta'];
      }
      const suffix = protocol === 'openai' ? 'chat/completions' : 'messages';
      const base = s.model.baseUrl.replace(/\/$/, '');
      const url = base.endsWith(`/${suffix}`) ? base : `${base}${base.endsWith('/v1') ? '' : '/v1'}/${suffix}`;
      const upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(upstreamBody), signal: controller.signal, redirect: 'error' });
      status = upstream.status;
      const streaming = upstream.headers.get('content-type')?.includes('text/event-stream') === true;
      res.writeHead(status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
      const decoder = new TextDecoder(); let bytes = 0;
      const held: Buffer[] = []; let wirePending = Buffer.alloc(0); let terminalSeen = false;
      const write = async (chunk: Uint8Array) => {
        if (res.destroyed || controller.signal.aborted) throw new Error('aborted');
        if (!res.write(chunk)) await new Promise<void>((resolve, reject) => {
          const cleanup = () => { res.removeListener('drain', drain); controller.signal.removeEventListener('abort', abort); };
          const drain = () => { cleanup(); resolve(); };
          const abort = () => { cleanup(); reject(new Error('aborted')); };
          res.once('drain', drain); controller.signal.addEventListener('abort', abort, { once: true });
          if (controller.signal.aborted) abort();
        });
      };
      if (upstream.body) for await (const chunk of upstream.body) {
        bytes += chunk.length;
        if (bytes > this.config.maxResponseBytes!) throw new Error('response_too_large');
        raw += decoder.decode(chunk, { stream: true });
        if (!streaming || terminalSeen) { held.push(Buffer.from(chunk)); continue; }
        wirePending = Buffer.concat([wirePending, chunk]);
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(wirePending.toString('latin1')))) {
          const end = boundary.index + boundary[0].length;
          const frame = wirePending.subarray(0, end); wirePending = wirePending.subarray(end);
          const data = frame.toString('utf8').split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
          const isTerminal = data === '[DONE]' || (data.startsWith('{') && JSON.parse(data).type === 'message_stop');
          if (isTerminal || terminalSeen) { terminalSeen = true; held.push(frame); }
          else await write(frame);
        }
        if (terminalSeen && wirePending.length) { held.push(wirePending); wirePending = Buffer.alloc(0); }
      }
      raw += decoder.decode();
      const decoded = upstream.ok ? decodeResponse(protocol, raw, streaming) : null;
      if (main) {
        await this.traces.append(s.runId, { type: 'model.response', identity, protocol, status, complete: upstream.ok && decoded?.complete === true, rawBody: raw, response: decoded, durationMs: Date.now() - startedAt });
        for (const tool of toolCalls(protocol, decoded?.message)) if (typeof tool.id === 'string') {
          s.tools.add(tool.id);
          await this.traces.append(s.runId, { type: 'tool.call', agentId, toolUseId: tool.id, name: tool.name, input: tool.input, requestId: identity.requestId });
        }
        recorded = true;
      }
      if (upstream.ok && !decoded?.complete) throw new Error('incomplete_model_response');
      // A client cannot observe successful completion until capture has been acknowledged.
      for (const chunk of held) await write(chunk);
      if (wirePending.length) await write(wirePending);
      res.end();
    } catch {
      controller.abort();
      if (main && !recorded) await this.traces.append(s.runId, { type: 'model.response', identity, protocol, status, complete: false, rawBody: raw, error: 'proxy_or_capture_failed', durationMs: Date.now() - startedAt });
      if (res.headersSent) res.destroy();
      else throw new ApiError(502, 'model_proxy_failed', 'Model forwarding or trajectory capture failed');
    } finally {
      clearTimeout(timeout); res.removeListener('close', close); s.controllers.delete(controller); s.active.delete(pending); settle();
    }
  }
  async toolResult(id: string, req: IncomingMessage, body: Record<string, unknown>) {
    const s = this.authorize(id, req);
    await Promise.all([...s.active]);
    if (body.agentId !== `main:${s.id}` || typeof body.toolUseId !== 'string' || !s.tools.has(body.toolUseId)) throw new ApiError(400, 'unknown_main_tool', 'Tool result must belong to a captured main Agent call');
    if (!Object.hasOwn(body, 'content') || typeof body.isError !== 'boolean') throw new ApiError(400, 'invalid_tool_result', 'Invalid tool result');
    const signature = JSON.stringify([body.content, body.isError]);
    const previous = s.results.get(body.toolUseId);
    if (previous && previous.signature !== signature) throw new ApiError(409, 'tool_result_conflict', 'Tool result already recorded with different content');
    if (!previous) {
      // Reserve before awaiting append to coalesce duplicate deliveries.
      const write = this.traces.append(s.runId, { type: 'tool.result', agentId: body.agentId, toolUseId: body.toolUseId, content: body.content, isError: body.isError });
      s.results.set(body.toolUseId, { signature, write });
      await write;
    } else await previous.write;
    return { accepted: true };
  }
}
