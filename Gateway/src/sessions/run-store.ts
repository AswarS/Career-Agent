import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from '../contracts.ts';
import type { CreateRunRequest, RunRecord } from '../contracts.ts';
import { ApiError } from '../api/validation.ts';

/** Bounded, process-local state. Harness side effects belong to HarnessRunner. */
export class RunStore {
  private runs = new Map<string, RunRecord>();
  private maxRuns: number;
  private executionAvailable: boolean;
  constructor(maxRuns = 100, executionAvailable = false) { this.maxRuns = maxRuns; this.executionAvailable = executionAvailable; }

  create(input: CreateRunRequest): RunRecord {
    if (this.runs.size >= this.maxRuns) throw new ApiError(503, 'run_capacity_reached', 'In-memory run capacity reached; clean up backend runs before restarting the service');
    const now = new Date().toISOString();
    const run: RunRecord = {
      schemaVersion: SCHEMA_VERSION,
      taskId: input.taskId,
      runId: randomUUID(),
      gatewaySessionId: randomUUID(),
      status: 'created',
      createdAt: now,
      updatedAt: now,
      policy: { conversationMemory: false, captureAgentRole: 'main', otherBackendFeatures: 'inherit' },
      harness: null,
      input: structuredClone(input),
      execution: { available: this.executionAvailable, reason: this.executionAvailable ? null : 'harness_not_configured' },
      initialFiles: [], error: null, reply: null, cleanup: 'not_requested', pendingQuestion: null,
    };
    this.runs.set(run.runId, run);
    return structuredClone(run);
  }

  get(id: string): RunRecord {
    const run = this.runs.get(id);
    if (!run) throw new ApiError(404, 'run_not_found', 'Run does not exist');
    return structuredClone(run);
  }

  update(id: string, patch: Partial<Pick<RunRecord, 'status' | 'harness' | 'initialFiles' | 'error' | 'reply' | 'cleanup' | 'pendingQuestion'>>) {
    const run = this.get(id);
    Object.assign(run, structuredClone(patch), { updatedAt: new Date().toISOString() });
    this.runs.set(id, run);
    return this.get(id);
  }

  cancel(id: string): RunRecord {
    const run = this.get(id);
    if (run.status === 'cancelled') return run;
    if (run.status !== 'created') throw new ApiError(409, 'invalid_run_state', 'Only a created run can be cancelled in phase one');
    run.status = 'cancelled';
    run.updatedAt = new Date().toISOString();
    this.runs.set(id, run);
    return structuredClone(run);
  }
}
