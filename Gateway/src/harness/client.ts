import type { HarnessBinding, JsonObject, RunRecord, RunStatus } from '../contracts.ts';
import type { GatewayRoute } from '../proxy/model-proxy.ts';

export interface HarnessSnapshot {
  runId: string; gatewaySessionId: string;
  status: Exclude<RunStatus, 'created'> | 'ready';
  harness: HarnessBinding | null;
  initialFiles: RunRecord['initialFiles']; error: string | null; reply: string | null;
  cleanup: RunRecord['cleanup']; pendingQuestion: JsonObject | null;
  visibleHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface HarnessClient {
  readiness?(): Promise<{ implementation: string; protocolVersion: number; databaseReachable: boolean }>;
  prepare(run: RunRecord): Promise<HarnessSnapshot>;
  get(id: string): Promise<HarnessSnapshot>;
  start(id: string): Promise<HarnessSnapshot>;
  cancel(id: string): Promise<HarnessSnapshot>;
  cleanup(id: string): Promise<HarnessSnapshot>;
  respond?(id: string, toolUseId: string, answers: Record<string, string>): Promise<HarnessSnapshot>;
}

export class HttpHarnessClient implements HarnessClient {
  private url: string; private token: string;
  private gateway?: (run: RunRecord) => GatewayRoute;
  constructor(url: string, token: string, gateway?: (run: RunRecord) => GatewayRoute) { this.url = url.replace(/\/$/, ''); this.token = token; this.gateway = gateway; }
  private async request(path: string, method: string, body?: unknown): Promise<HarnessSnapshot> {
    const response = await fetch(`${this.url}/runs${path}`, {
      method, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`harness_http_${response.status}`);
    const value = await response.json() as HarnessSnapshot;
    if (!value || typeof value.runId !== 'string' || typeof value.gatewaySessionId !== 'string'
      || !['preparing', 'ready', 'running', 'waiting_user', 'completed', 'failed', 'cancelled', 'timed_out'].includes(value.status)
      || !Array.isArray(value.initialFiles)) throw new Error('invalid_harness_response');
    return value;
  }
  prepare(run: RunRecord) { return this.request('', 'POST', { runId: run.runId, gatewaySessionId: run.gatewaySessionId, input: run.input, ...(this.gateway ? { gateway: this.gateway(run) } : {}) }); }
  async readiness() {
    const response = await fetch(`${this.url}/runs/readiness`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('harness_readiness_failed'); }
    const value = await response.json() as { implementation: string; protocolVersion: number; databaseReachable: boolean };
    // Project fixed fields only; never proxy arbitrary backend data into the public report.
    return { implementation: value.implementation === 'career-agent-nestjs' ? value.implementation : 'unknown', protocolVersion: value.protocolVersion === 1 ? 1 : 0, databaseReachable: value.databaseReachable === true };
  }
  get(id: string) { return this.request(`/${encodeURIComponent(id)}`, 'GET'); }
  start(id: string) { return this.request(`/${encodeURIComponent(id)}/start`, 'POST'); }
  cancel(id: string) { return this.request(`/${encodeURIComponent(id)}/cancel`, 'POST'); }
  cleanup(id: string) { return this.request(`/${encodeURIComponent(id)}`, 'DELETE'); }
  respond(id: string, toolUseId: string, answers: Record<string, string>) { return this.request(`/${encodeURIComponent(id)}/user-questions/${encodeURIComponent(toolUseId)}/respond`, 'POST', { answers }); }
}
