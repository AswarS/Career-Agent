import { randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { CreateRunRequest, RunRecord } from '../contracts.ts';
import { verifyRun, verifyIsolation } from './verify.ts';

export interface WorkflowOptions {
  gatewayUrl: string; token?: string; task: CreateRunRequest; output: string;
  samples?: number; cleanup?: boolean; requireSkill?: boolean; requireTrainingReady?: boolean;
  tokenWaitMs?: number; pollMs?: number; signal?: AbortSignal;
}
/** Runs real service requests; tests inject local HTTP fixtures, never a hidden success fallback. */
export async function runWorkflow(options: WorkflowOptions) {
  const count = options.samples ?? 2;
  if (!Number.isInteger(count) || count < 2 || count > 10) throw new Error('samples_must_be_2_to_10');
  if (!options.task.userSimulator) throw new Error('acceptance_requires_user_simulator');
  await mkdir(options.output, { recursive: true });
  if ((await readdir(options.output)).length) throw new Error('output_directory_not_empty');
  await writeFile(join(options.output, '.workflow-run'), new Date().toISOString(), { flag: 'wx' });
  const report: any = { schemaVersion: '1.0', startedAt: new Date().toISOString(), passed: false, scope: 'service_integration', acceptanceTargets: { samples: count, skillToolRequired: options.requireSkill === true, trainingReadyRequired: options.requireTrainingReady === true }, runs: [], failures: [] };
  const owned: string[] = [];
  async function request(path: string, method = 'GET', body?: unknown, independent = false) {
    const response = await fetch(`${options.gatewayUrl.replace(/\/$/, '')}${path}`, {
      method, headers: { 'content-type': 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(!independent && options.signal ? [options.signal] : [])]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`gateway_http_${response.status}`); }
    return await response.json() as any;
  }
  try {
    const capabilities = (await request('/v1/capabilities')).capabilities;
    for (const name of ['harnessExecution', 'modelProxy', 'mainAgentCapture', 'userSimulator', 'trajectoryExport', 'trajectoryFinalization']) if (!capabilities?.[name]) throw new Error(`missing_capability:${name}`);
    report.readiness = await request('/v1/readiness');
    if (!report.readiness.ready || report.readiness.backend?.implementation !== 'career-agent-nestjs') throw new Error('backend_not_ready');
    const proofs: string[] = [];
    // Register in sequence to retain every acknowledged ID; launched tasks execute concurrently.
    for (let i = 0; i < count; i++) {
      const proof = `workspace-proof-${randomUUID()}`; proofs.push(proof);
      const task = structuredClone(options.task);
      const path = `training-proof-${randomUUID()}.txt`;
      task.workspace.files.push({ path, encoding: 'utf8', content: proof });
      task.query += `\n训练验收要求：先使用文件工具读取 workspace 中的 ${path}，然后必须通过 Ask_User_Question 工具询问一个与任务相关的问题，收到回答后继续完成任务。${options.requireSkill ? '还必须调用一个可用的 Skill 工具完成相关子任务。' : ''}`;
      report.creationUnconfirmed = true;
      const run = await request('/v1/runs', 'POST', task) as RunRecord;
      if (!/^[a-f0-9-]{36}$/.test(run.runId)) throw new Error('invalid_created_run_id');
      owned.push(run.runId);
      report.creationUnconfirmed = false;
      report.runs.push({ runId: run.runId, status: run.status, check: null, cleanup: 'not_requested' });
      await writeFile(join(options.output, 'created-runs.json'), JSON.stringify({ runIds: owned }, null, 2));
    }
    const finalRuns: RunRecord[] = [];
    for (let i = 0; i < owned.length; i++) {
      const id = owned[i]!;
      const deadline = Date.now() + options.task.limits.timeoutMs + 30_000;
      let run: RunRecord;
      while (true) {
        run = await request(`/v1/runs/${id}`);
        if (['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) break;
        if (Date.now() > deadline) throw new Error('workflow_deadline_exceeded');
        await delay(options.pollMs ?? 500, undefined, { signal: options.signal });
      }
      finalRuns.push(run);
      let trajectory = await request(`/v1/runs/${id}/trajectory`);
      if (options.requireTrainingReady && run.status === 'completed') {
        const tokenDeadline = Date.now() + (options.tokenWaitMs ?? 120_000);
        while (true) {
          const reqIds = trajectory.events.filter((e: any) => e.payload.type === 'model.request').map((e: any) => e.payload.identity.requestId);
          const supplied = new Set(trajectory.events.filter((e: any) => e.payload.type === 'training.tokens').map((e: any) => e.payload.requestId));
          if (reqIds.length && reqIds.every((rid: string) => supplied.has(rid))) break;
          if (Date.now() >= tokenDeadline) throw new Error('training_tokens_not_received_before_deadline');
          await delay(options.pollMs ?? 500, undefined, { signal: options.signal });
          trajectory = await request(`/v1/runs/${id}/trajectory`);
        }
      }
      const check = verifyRun(run, trajectory, proofs[i]!, options.requireSkill);
      await request(`/v1/runs/${id}/finalize`, 'POST');
      const exported = await request(`/v1/runs/${id}/trajectory`);
      if (options.requireTrainingReady && !exported.trainingReady) { check.passed = false; check.failures.push('training_export_not_ready'); }
      const artifact = `${id}.trajectory.json`;
      await writeFile(join(options.output, artifact), JSON.stringify(exported, null, 2), { flag: 'wx' });
      Object.assign(report.runs[i], { status: run.status, check, trainingReady: exported.trainingReady, trainingReasons: exported.reasons, artifact });
    }
    report.isolation = verifyIsolation(finalRuns);
    report.passed = report.isolation.passed && report.runs.every((r: any) => r.check.passed);
  } catch (error) {
    // Only report our fixed error categories, never external bodies, URLs or credentials.
    const message = error instanceof Error ? error.message : '';
    report.failures.push(/^(gateway_http_\d+|missing_capability:\w+|backend_not_ready|invalid_created_run_id|workflow_deadline_exceeded|training_tokens_not_received_before_deadline)$/.test(message) ? message : options.signal?.aborted ? 'interrupted' : 'workflow_failed');
  } finally {
    if (!report.passed) {
      report.cancellation = [];
      for (const id of owned) {
        try { await request(`/v1/runs/${id}/cancel`, 'POST', undefined, true); report.cancellation.push({ runId: id, confirmed: true }); }
        catch { report.cancellation.push({ runId: id, confirmed: false }); }
      }
    }
    if (options.cleanup) {
      report.cleanup = [];
      for (const id of owned) {
        try { const r = await request(`/v1/runs/${id}`, 'DELETE', undefined, true); const ok = r.cleanup === 'completed'; report.cleanup.push({ runId: id, completed: ok }); if (!ok) report.passed = false; }
        catch { report.cleanup.push({ runId: id, completed: false }); report.passed = false; }
      }
    }
    report.finishedAt = new Date().toISOString();
    await writeFile(join(options.output, 'report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}
