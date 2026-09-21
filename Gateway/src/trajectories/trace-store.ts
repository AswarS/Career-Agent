import { open, mkdir, readFile, rename, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ApiError } from '../api/validation.ts';
import { trainingExport, validateTokens } from '../training/export.ts';
import type { JournalEvent } from '../training/export.ts';
import { messageExport, messagesListExport } from '../training/messages.ts';

interface State { events: JournalEvent[]; manifest?: any; poisoned?: boolean }
const canonical = (value: any): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = (events: JournalEvent[]) => createHash('sha256').update(events.map(e => JSON.stringify(e) + '\n').join('')).digest('hex');

/** Single writer per directory. ACK after sync; finalization makes the journal immutable. */
export class TraceStore {
  private root: string;
  private states = new Map<string, State>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(root: string) { this.root = root; }
  private path(id: string, suffix = 'events.jsonl') {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(400, 'invalid_run_id', 'Invalid trace identity');
    return join(this.root, `${id}.${suffix}`);
  }
  private async state(id: string) {
    if (this.states.has(id)) return this.states.get(id)!;
    await mkdir(this.root, { recursive: true });
    const state: State = { events: [] };
    const optional = async (path: string) => readFile(path).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return null; });
    const manifest = await optional(this.path(id, 'manifest.json'));
    if (manifest) state.manifest = JSON.parse(manifest.toString());
    const bytes = await optional(this.path(id));
    if (bytes) {
      const end = bytes.lastIndexOf(10) + 1;
      if (end !== bytes.length) {
        if (state.manifest) throw new Error('sealed_journal_corrupt');
        // Only an unacknowledged final partial line may be discarded.
        await truncate(this.path(id), end);
        const file = await open(this.path(id), 'r+'); try { await file.sync(); } finally { await file.close(); }
      }
      state.events = bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
      const ids = new Set<string>();
      state.events.forEach((e, i) => {
        if (e.schemaVersion !== '1.0' || e.runId !== id || e.sequence !== i + 1 || ids.has(e.eventId) || !e.payload) throw new Error('journal_corrupt');
        ids.add(e.eventId);
      });
    }
    if (state.manifest && (state.manifest.runId !== id || state.manifest.eventCount !== state.events.length || state.manifest.sha256 !== hash(state.events))) throw new Error('sealed_journal_checksum_mismatch');
    this.states.set(id, state); return state;
  }
  private serial<T>(id: string, fn: (s: State) => Promise<T>): Promise<T> {
    this.path(id);
    const work = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const state = await this.state(id);
      if (state.poisoned) throw new Error('journal_write_failed');
      return fn(state);
    });
    this.queues.set(id, work); return work;
  }
  private async write(id: string, s: State, input: Omit<JournalEvent, 'sequence' | 'receivedAt'>) {
    const existing = s.events.find(e => e.eventId === input.eventId);
    if (existing) {
      const { sequence: _s, receivedAt: _r, ...old } = existing;
      if (canonical(old) !== canonical(input)) throw new ApiError(409, 'event_conflict', 'Event ID already has different content');
      return existing;
    }
    if (s.manifest) throw new ApiError(409, 'trajectory_finalized', 'Trajectory is immutable');
    const event: JournalEvent = { ...input, sequence: s.events.length + 1, receivedAt: new Date().toISOString() };
    try {
      const file = await open(this.path(id), 'a');
      try { await file.writeFile(JSON.stringify(event) + '\n', 'utf8'); await file.sync(); } finally { await file.close(); }
      s.events.push(event);
      // Derived, replaceable snapshot. The authoritative journal is never rewritten.
      const temp = this.path(id, `messages_list.${randomUUID()}.tmp`);
      const snapshot = { runId: id, throughSequence: event.sequence, ...messagesListExport(s.events) };
      const derived = await open(temp, 'wx');
      try { await derived.writeFile(JSON.stringify(snapshot, null, 2) + '\n', 'utf8'); } finally { await derived.close(); }
      await rename(temp, this.path(id, 'messages_list.json'));
    } catch (error) { s.poisoned = true; throw error; }
    return event;
  }
  async append(id: string, payload: Record<string, unknown>): Promise<void> {
    const copied = structuredClone(payload);
    if (copied.identity && typeof copied.identity === 'object') copied.identity = { ...copied.identity, runId: id };
    const input = { schemaVersion: '1.0' as const, runId: id, eventId: randomUUID(), occurredAt: new Date().toISOString(), payload: copied };
    await this.serial(id, s => this.write(id, s, input));
  }
  async ingest(id: string, gatewaySessionId: string, value: any) {
    if (!value || value.schemaVersion !== '1.0' || value.runId !== id || typeof value.eventId !== 'string' || !/^[\w.-]{1,128}$/.test(value.eventId)
      || value.eventId.startsWith('gateway.') || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt)) || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)
      || Object.keys(value).some(k => !['schemaVersion', 'runId', 'eventId', 'occurredAt', 'payload'].includes(k))) throw new ApiError(400, 'invalid_event', 'Invalid event envelope');
    const input = structuredClone(value) as Omit<JournalEvent, 'sequence' | 'receivedAt'>;
    const p = input.payload, main = `main:${gatewaySessionId}`;
    if (!['model.request', 'model.response', 'tool.call', 'tool.result', 'training.tokens'].includes(p.type)) throw new ApiError(400, 'invalid_event_type', 'Unsupported producer event');
    if (p.type.startsWith('model.')) {
      if (p.identity?.agentId !== main || p.identity?.agentRole !== 'main' || p.identity?.purpose !== 'policy' || p.identity?.parentAgentId || p.identity?.gatewaySessionId !== gatewaySessionId || p.identity?.runId !== id || typeof p.identity?.requestId !== 'string' || !/^[\w.-]{1,128}$/.test(p.identity.requestId)
        || !['openai', 'anthropic'].includes(p.protocol)) throw new ApiError(400, 'invalid_identity', 'Explicit main Agent identity required');
      if (p.type === 'model.request' && (!p.body || typeof p.body !== 'object' || Array.isArray(p.body))) throw new ApiError(400, 'invalid_event', 'Request body required');
      if (p.type === 'model.response' && (typeof p.complete !== 'boolean' || !Number.isInteger(p.status))) throw new ApiError(400, 'invalid_event', 'Response status required');
    } else if (p.type.startsWith('tool.') && (p.agentId !== main || typeof p.toolUseId !== 'string' || !p.toolUseId)) throw new ApiError(400, 'invalid_identity', 'Explicit main tool identity required');
    if (p.type === 'tool.call' && (typeof p.name !== 'string' || !p.input || typeof p.input !== 'object')) throw new ApiError(400, 'invalid_event', 'Tool input required');
    if (p.type === 'tool.result' && (!Object.hasOwn(p, 'content') || typeof p.isError !== 'boolean')) throw new ApiError(400, 'invalid_event', 'Tool result required');
    if (p.type === 'training.tokens') { try { validateTokens(p); } catch { throw new ApiError(400, 'invalid_training_tokens', 'Engine token arrays, versions and masks are invalid'); } }
    if (/<\/?conversation_memory>|<career-agent:conversation-memory-checkpoint>|career-agent:conversation-memory:start/.test(JSON.stringify(p))) throw new ApiError(400, 'conversation_memory_detected', 'Disabled memory marker in event');
    return this.serial(id, async s => {
      if (p.type === 'training.tokens') {
        if (!s.events.some(e => e.payload.type === 'model.request' && e.payload.identity.requestId === p.requestId)) throw new ApiError(409, 'unknown_policy_request', 'Tokens must reference a captured main request');
        if (s.events.some(e => e.payload.type === 'training.tokens' && e.payload.requestId === p.requestId && e.eventId !== input.eventId)) throw new ApiError(409, 'duplicate_token_sample', 'One token sample per request');
      }
      return structuredClone(await this.write(id, s, input));
    });
  }
  async events(id: string, after = 0, limit = 1000) {
    return this.serial(id, async s => {
      if (after > s.events.length) throw new ApiError(400, 'cursor_ahead', 'Cursor is beyond the journal');
      return { events: structuredClone(s.events.slice(after, after + limit)), nextCursor: Math.min(s.events.length, after + limit), finalized: Boolean(s.manifest) };
    });
  }
  async read(id: string): Promise<unknown[]> {
    return this.serial(id, async s => s.events.filter(e => e.payload.type !== 'training.tokens').map(e => ({ ...structuredClone(e.payload), schemaVersion: 'diagnostic.v1', runId: id, sequence: e.sequence, receivedAt: e.receivedAt })));
  }
  async finalize(id: string, run: { status: string; gatewaySessionId: string }) {
    return this.serial(id, async s => {
      if (s.manifest) return structuredClone(s.manifest);
      if (!['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) throw new ApiError(409, 'run_not_terminal', 'Finish or cancel the run before finalizing');
      if (!s.events.some(e => e.eventId === 'gateway.run.finished')) await this.write(id, s, { schemaVersion: '1.0', eventId: 'gateway.run.finished', runId: id, occurredAt: new Date().toISOString(), payload: { type: 'run.finished', status: run.status } });
      const manifest = { schemaVersion: '1.0', runId: id, gatewaySessionId: run.gatewaySessionId, finalizedAt: new Date().toISOString(), eventCount: s.events.length, sha256: hash(s.events), run: structuredClone(run), ...trainingExport(s.events, run.status, true) };
      const { samples: _samples, ...compact } = manifest;
      const temp = this.path(id, `manifest.${randomUUID()}.tmp`);
      try {
        const file = await open(temp, 'wx'); try { await file.writeFile(JSON.stringify(compact), 'utf8'); await file.sync(); } finally { await file.close(); }
        await rename(temp, this.path(id, 'manifest.json')); s.manifest = compact;
      } catch (error) { s.poisoned = true; throw error; }
      return structuredClone(compact);
    });
  }
  async export(id: string, format: 'events' | 'messages' | 'messages_list' = 'events') {
    return this.serial(id, async s => {
      if (!s.events.length && !s.manifest) throw new ApiError(404, 'trajectory_not_found', 'No trajectory recorded');
      return { schemaVersion: '1.0', runId: id, finalized: Boolean(s.manifest), manifest: structuredClone(s.manifest ?? null), ...(format === 'messages_list' ? messagesListExport(s.events) : format === 'messages' ? messageExport(s.events) : { events: structuredClone(s.events) }), ...trainingExport(s.events, s.manifest?.run.status ?? 'unknown', Boolean(s.manifest)) };
    });
  }
}
