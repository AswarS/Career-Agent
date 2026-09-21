import { setTimeout as delay } from 'node:timers/promises';
import type { HarnessClient, HarnessSnapshot } from './client.ts';
import { RunStore } from '../sessions/run-store.ts';
import { ApiError } from '../api/validation.ts';
import { UserSimulator, questionRequest, validateAnswers } from '../user-simulator/simulator.ts';

const terminal = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
export class HarnessRunner {
  private store: RunStore; private client: HarnessClient; private pollMs: number;
  private active = new Map<string, Promise<void>>();
  private stopped = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private answers = new Map<string, { signature: string; work: Promise<HarnessSnapshot> }>();
  private simulator?: UserSimulator;
  private record?: (id: string, event: Record<string, unknown>) => Promise<unknown>;
  constructor(store: RunStore, client: HarnessClient, pollMs = 250, simulator?: UserSimulator, record?: (id: string, event: Record<string, unknown>) => Promise<unknown>) {
    this.store = store; this.client = client; this.pollMs = pollMs; this.simulator = simulator; this.record = record;
  }

  launch(id: string) {
    if (this.active.has(id)) return;
    this.store.update(id, { status: 'preparing' });
    this.controllers.set(id, new AbortController());
    const work = this.run(id).finally(() => this.active.delete(id));
    this.active.set(id, work);
  }
  private sync(id: string, snapshot: HarnessSnapshot) {
    const run = this.store.get(id);
    if (snapshot.runId !== id || snapshot.gatewaySessionId !== run.gatewaySessionId) throw new Error('harness_identity_mismatch');
    return this.store.update(id, {
      status: snapshot.status === 'ready' ? 'preparing' : snapshot.status,
      harness: snapshot.harness, initialFiles: snapshot.initialFiles,
      reply: snapshot.reply, error: snapshot.error, cleanup: snapshot.cleanup, pendingQuestion: snapshot.pendingQuestion,
    });
  }
  private async run(id: string) {
    const run = this.store.get(id);
    const deadline = Date.now() + run.input.limits.timeoutMs;
    const controller = this.controllers.get(id)!;
    const timer = setTimeout(() => controller.abort(), run.input.limits.timeoutMs);
    try {
      let snapshot = await this.client.prepare(run);
      while (true) {
        if (this.stopped.has(id)) {
          // A prepare request may have completed after cancellation; cancel again by stable ID.
          this.sync(id, await this.client.cancel(id));
          return;
        }
        this.sync(id, snapshot);
        if (terminal.has(snapshot.status)) return;
        if (Date.now() >= deadline) {
          await this.client.cancel(id);
          this.store.update(id, { status: 'timed_out' }); return;
        }
        if (snapshot.status === 'ready') snapshot = await this.client.start(id);
        else if (snapshot.status === 'waiting_user' && run.input.userSimulator && snapshot.pendingQuestion) {
          snapshot = await this.respond(id, String(snapshot.pendingQuestion.toolUseId), undefined, snapshot);
        }
        else { await delay(this.pollMs); snapshot = await this.client.get(id); }
      }
    } catch {
      // No automatic POST retry: inference may already have started on the backend.
      this.store.update(id, { status: this.stopped.has(id) ? 'cancelled' : controller.signal.aborted ? 'timed_out' : 'failed', error: this.stopped.has(id) ? null : 'harness_or_user_simulation_failed' });
      try { await this.client.cancel(id); }
      catch { this.store.update(id, { error: 'harness_unreachable_execution_state_unknown' }); }
    } finally { clearTimeout(timer); }
  }
  async respond(id: string, toolUseId: string, supplied?: unknown, known?: HarnessSnapshot): Promise<HarnessSnapshot> {
    const run = this.store.get(id);
    const signature = supplied === undefined ? 'simulator' : JSON.stringify(Object.entries(supplied && typeof supplied === 'object' ? supplied : {}).sort(([a], [b]) => a.localeCompare(b)));
    const key = `${id}:${toolUseId}`;
    const existing = this.answers.get(key);
    if (existing) {
      if (existing.signature !== signature) throw new ApiError(409, 'answer_conflict', 'A different answer is already being delivered');
      return existing.work;
    }
    if (!this.client.respond || this.stopped.has(id) || terminal.has(run.status)) throw new ApiError(409, 'question_not_waiting', 'Run is not waiting for an answer');
    if (supplied !== undefined && run.input.userSimulator) throw new ApiError(409, 'automatic_user_terminal', 'This run uses the automatic user terminal');
    if (supplied === undefined && (!run.input.userSimulator || !this.simulator)) throw new ApiError(400, 'answers_required', 'Supply answers for an external user terminal');
    let deliveryStarted = false;
    const work = (async () => {
      const snapshot = known ?? await this.client.get(id);
      if (snapshot.status !== 'waiting_user' || snapshot.pendingQuestion?.toolUseId !== toolUseId) throw new ApiError(409, 'question_not_waiting', 'Tool does not match the pending question');
      this.sync(id, snapshot);
      const request = questionRequest(this.store.get(id), snapshot.visibleHistory ?? []);
      const controller = this.controllers.get(id)!;
      let answers: Record<string, string>;
      if (supplied === undefined) answers = await this.simulator!.answer(run.input.userSimulator!.modelProfile, request, controller.signal);
      else {
        try { answers = validateAnswers(request, supplied); }
        catch { throw new ApiError(400, 'invalid_answers', 'Provide one non-empty string answer per question, keyed by exact question text'); }
      }
      controller.signal.throwIfAborted();
      deliveryStarted = true;
      await this.record?.(id, { type: 'user.answer', toolUseId, questions: request.questions, answers, source: supplied === undefined ? 'user_simulator' : 'external_terminal' });
      controller.signal.throwIfAborted();
      let result: HarnessSnapshot;
      try { result = await this.client.respond!(id, toolUseId, answers); }
      catch {
        // This endpoint is idempotent. Retry the same answer once; never resample the user.
        await delay(100, undefined, { signal: controller.signal });
        result = await this.client.respond!(id, toolUseId, answers);
      }
      controller.signal.throwIfAborted();
      this.sync(id, result);
      return result;
    })().catch(error => {
      if (!deliveryStarted && supplied !== undefined) this.answers.delete(key);
      throw error;
    });
    this.answers.set(key, { signature, work });
    return work;
  }
  async cancel(id: string) {
    const run = this.store.get(id);
    if (terminal.has(run.status)) return run;
    this.stopped.add(id);
    this.controllers.get(id)?.abort();
    try {
      const snapshot = await this.client.cancel(id);
      this.sync(id, snapshot);
      return this.store.get(id);
    } catch {
      throw new ApiError(502, 'harness_cancel_unconfirmed', 'Backend cancellation could not be confirmed; retry or inspect the backend');
    }
  }
  async cleanup(id: string) {
    this.store.get(id);
    this.stopped.add(id);
    this.controllers.get(id)?.abort();
    await this.active.get(id);
    try { return this.sync(id, await this.client.cleanup(id)); }
    catch { throw new ApiError(502, 'harness_cleanup_failed', 'Backend cleanup could not be confirmed'); }
  }
  async shutdown() {
    await Promise.allSettled([...this.active.keys()].map(id => this.cancel(id)));
    await Promise.allSettled([...this.active.values()]);
  }
  async drain(id: string) {
    await this.active.get(id);
    await Promise.allSettled([...this.answers].filter(([key]) => key.startsWith(`${id}:`)).map(([, entry]) => entry.work));
  }
}
