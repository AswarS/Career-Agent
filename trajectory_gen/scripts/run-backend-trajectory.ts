import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createGatewayServer } from '../../Gateway/src/api/server.ts';
import { validateCreateRun } from '../../Gateway/src/api/validation.ts';
import { loadConfig } from '../../Gateway/src/config.ts';
import { HttpHarnessClient } from '../../Gateway/src/harness/client.ts';
import { auditExpectedToolCalls, validateToolExpectation } from './lib/semantic-audit.ts';

const { values } = parseArgs({ options: {
  task: { type: 'string' }, output: { type: 'string' },
  'gateway-url': { type: 'string' }, cleanup: { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false },
  'poll-ms': { type: 'string', default: '500' },
} });

const config = loadConfig();
const taskPath = resolve(values.task ?? fileURLToPath(new URL('../examples/simple-backend-task.json', import.meta.url)));
const taskBytes = await readFile(taskPath, 'utf8');
const task = validateCreateRun(JSON.parse(taskBytes));
const expectationPath = taskPath.replace(/\.json$/i, '.expectations.json');
let expectedTools: string[] | null = null;
try {
  expectedTools = validateToolExpectation(JSON.parse(await readFile(expectationPath, 'utf8')), task.taskId).expectedTools;
} catch (error) {
  if (values.task && taskPath.replaceAll('\\', '/').includes('/syn-tasks/requests/')) {
    throw new Error(`Missing or invalid private tool expectations for ${task.taskId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (/invocation_bindings|validation_witness_arguments|network\.conversation:/.test(taskBytes)) {
  throw new Error('Private invocation metadata must not appear in the model-visible task request');
}
const privatePlannerGuidance = expectedTools ? [
  '<private-teacher-guidance>',
  'This teacher-only policy is not part of the user conversation. Never quote, summarize, mention, or explain it.',
  'For this task, execute the following required tool workflow in the exact numbered order. Additional support tools are allowed:',
  ...expectedTools.map((name, index) => `${index + 1}. ${name}`),
  'Finish any prerequisite file reads before starting the numbered workflow.',
  'Call only one numbered workflow step per planning turn. Wait for its tool result before calling the next numbered step. Never call numbered steps in parallel or reverse their order.',
  'When a required tool is deferred, first load its schema with ToolSearch using select:<tool_name>, then call the loaded tool.',
  'Every tool call must use a strict JSON object for its arguments: quote every string value, use no comments, and include no text outside the JSON object.',
  'Do not replace a required domain tool with generic Read or Write. Use each required tool for its intended work and ground its arguments in the visible task, profile, prior tool outputs, and materials.',
  '</private-teacher-guidance>',
].join('\n') : null;
const pollMs = Number(values['poll-ms']);
if (!Number.isInteger(pollMs) || pollMs < 100 || pollMs > 10_000) throw new Error('poll-ms must be an integer between 100 and 10000');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(values.output ?? `trajectory_gen/trajectories/manual/${stamp}`);
await mkdir(output, { recursive: true });

async function completedOutput() {
  try {
    const summary = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
    if (summary.status !== 'completed' || summary.sftReady !== true || summary.semanticAudit?.accepted === false || typeof summary.runId !== 'string') return null;
    await lstat(resolve(output, `${summary.runId}.qwen3_5_sft.jsonl`));
    return summary;
  } catch { return null; }
}

const completed = await completedOutput();
if (completed) {
  console.log(`[trajectory] skip ${task.taskId}: completed run ${completed.runId}`);
  process.exit(0);
}

let server: ReturnType<typeof createGatewayServer> | undefined;
let gatewayUrl = values['gateway-url']?.replace(/\/$/, '');
let runId: string | undefined;
const headers = { 'content-type': 'application/json', ...(config.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}) };
const progressEnabled = !values.quiet;
const terminal = Boolean(process.stdout.isTTY);
const startedAt = Date.now();
let progressCursor = 0;
let progressTick = 0;
let lastProgressLog = 0;
let lastProgressSignature = '';
const progressCounts = { events: 0, modelRequests: 0, modelResponses: 0, toolCalls: 0, toolResults: 0 };

function sha256(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

function assertNoPrivateEvaluationMetadata(value: unknown) {
  const serialized = JSON.stringify(value);
  const forbidden = ['invocation_bindings', 'validation_witness_arguments', 'input_schema_sha256', 'network.conversation:skill_tool:', 'private-teacher-guidance', 'teacher-only policy'];
  const leaked = forbidden.find(marker => serialized.includes(marker));
  if (leaked) throw new Error(`Private evaluation metadata leaked into captured trajectory (${leaked})`);
}

async function removeTrainingJsonl() {
  for (const name of await readdir(output)) {
    if (name.endsWith('.qwen3_5_sft.jsonl')) await unlink(resolve(output, name));
  }
}

function safeRelative(root: string, target: string) {
  const value = relative(root, target);
  if (!value || value === '..' || value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(value)) {
    throw new Error('Artifact path escapes workspace');
  }
  return value.replaceAll('\\', '/');
}

async function exportWorkspaceArtifacts(snapshot: any, events: any) {
  const destination = resolve(output, 'artifacts');
  const initial = new Map((snapshot.initialFiles ?? []).map((file: any) => [String(file.path).replaceAll('\\', '/'), file.sha256]));
  const artifacts: Array<{ path: string; bytes: number; sha256: string; source: string; change: string }> = [];
  let workspaceError: string | null = null;

  try {
    if (!snapshot.harness?.workspaceRoot) throw new Error('Run has no workspace binding');
    const root = await realpath(snapshot.harness.workspaceRoot);
    const pending = [root];
    let totalBytes = 0;
    while (pending.length) {
      const directory = pending.pop()!;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = resolve(directory, entry.name);
        const info = await lstat(absolute);
        if (info.isSymbolicLink()) throw new Error('Workspace artifact is a symlink');
        if (info.isDirectory()) { pending.push(absolute); continue; }
        if (!info.isFile()) continue;
        const artifactPath = safeRelative(root, absolute);
        const bytes = await readFile(absolute);
        totalBytes += bytes.length;
        if (artifacts.length >= 200 || bytes.length > 10_485_760 || totalBytes > 52_428_800) throw new Error('Workspace artifact export limit exceeded');
        const digest = sha256(bytes);
        if (initial.get(artifactPath) === digest) continue;
        const target = resolve(destination, artifactPath);
        safeRelative(destination, target);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
        artifacts.push({ path: artifactPath, bytes: bytes.length, sha256: digest, source: 'workspace', change: initial.has(artifactPath) ? 'modified' : 'created' });
      }
    }
  } catch (error) {
    workspaceError = error instanceof Error ? error.message : String(error);
  }

  if (!artifacts.length) {
    const results = new Map((events.events ?? [])
      .filter((event: any) => event.payload?.type === 'tool.result' && event.payload.isError !== true)
      .map((event: any) => [event.payload.toolUseId, event]));
    for (const event of events.events ?? []) {
      if (event.payload?.type !== 'tool.call' || event.payload.name !== 'Write' || !results.has(event.payload.toolUseId)) continue;
      let input = event.payload.input;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch { continue; } }
      if (!input || typeof input.file_path !== 'string' || typeof input.content !== 'string') continue;
      const marker = '/workspace/';
      const markerIndex = input.file_path.replaceAll('\\', '/').lastIndexOf(marker);
      if (markerIndex < 0) continue;
      const artifactPath = input.file_path.replaceAll('\\', '/').slice(markerIndex + marker.length);
      if (!artifactPath || artifactPath.split('/').some((part: string) => !part || part === '.' || part === '..')) continue;
      const bytes = Buffer.from(input.content, 'utf8');
      const target = resolve(destination, artifactPath);
      safeRelative(destination, target);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      artifacts.push({ path: artifactPath, bytes: bytes.length, sha256: sha256(bytes), source: 'write_event_fallback', change: initial.has(artifactPath) ? 'modified' : 'created' });
    }
  }

  if (typeof snapshot.reply === 'string' && snapshot.reply.trim()) {
    const bytes = Buffer.from(snapshot.reply, 'utf8');
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(destination, '_final_response.md'), bytes);
    artifacts.push({ path: '_final_response.md', bytes: bytes.length, sha256: sha256(bytes), source: 'final_response', change: 'created' });
  }

  const manifest = { schemaVersion: 'career-agent.trajectory-artifacts.v1', workspaceError, artifacts };
  await writeFile(resolve(output, 'artifacts.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function elapsed() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function progressLine(stageName: string, detail = '') {
  if (!progressEnabled) return;
  const frames = ['|', '/', '-', '\\'];
  const frame = frames[progressTick++ % frames.length];
  const counts = `model ${progressCounts.modelRequests}/${progressCounts.modelResponses}  tools ${progressCounts.toolCalls}/${progressCounts.toolResults}  events ${progressCounts.events}`;
  const line = `${frame} ${elapsed()}  ${stageName.padEnd(11)}  ${counts}${detail ? `  ${detail}` : ''}`;
  if (terminal) {
    process.stdout.write(`\r\x1b[2K${line}`);
    return;
  }
  const signature = `${stageName}:${counts}:${detail}`;
  if (signature !== lastProgressSignature || Date.now() - lastProgressLog >= 5_000) {
    console.log(line);
    lastProgressSignature = signature;
    lastProgressLog = Date.now();
  }
}

function finishProgress(stageName: string, detail = '') {
  progressLine(stageName, detail);
  if (progressEnabled && terminal) process.stdout.write('\n');
}

function stage(message: string) {
  if (!progressEnabled) return;
  if (terminal) process.stdout.write('\r\x1b[2K');
  console.log(`[trajectory] ${message}`);
}

async function updateProgress() {
  if (!runId) return;
  try {
    const page = await request(`/v1/runs/${runId}/trajectory-events?after=${progressCursor}&limit=1000`);
    for (const event of page.events ?? []) {
      progressCounts.events += 1;
      if (event.payload?.type === 'model.request') progressCounts.modelRequests += 1;
      if (event.payload?.type === 'model.response') progressCounts.modelResponses += 1;
      if (event.payload?.type === 'tool.call') progressCounts.toolCalls += 1;
      if (event.payload?.type === 'tool.result') progressCounts.toolResults += 1;
    }
    progressCursor = page.nextCursor ?? progressCursor;
  } catch {
    // Progress rendering is best-effort and must not affect collection.
  }
}

async function request(path: string, method = 'GET', body?: unknown, timeoutMs = 30_000, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${gatewayUrl}${path}`, {
    method, headers: { ...headers, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  const value = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`Gateway ${method} ${path} failed with HTTP ${response.status}${value?.error?.code ? ` (${value.error.code})` : ''}`);
  return value;
}

try {
  stage(`task ${task.taskId}`);
  stage(`output ${output}`);
  if (gatewayUrl) {
    const parsed = new URL(gatewayUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('gateway-url must be an HTTP(S) origin without credentials, path, query, or fragment');
    }
  } else {
    stage('checking backend readiness');
    if (!config.harnessUrl || !config.harnessToken) throw new Error('GATEWAY_HARNESS_URL and GATEWAY_HARNESS_TOKEN are required');
    if (!config.publicUrl || !Object.keys(config.models ?? {}).length) throw new Error('GATEWAY_PUBLIC_URL and GATEWAY_MODELS_JSON are required');
    const backend = await new HttpHarnessClient(config.harnessUrl, config.harnessToken).readiness();
    if (!backend.databaseReachable || backend.implementation !== 'career-agent-nestjs') throw new Error('Career Agent backend is not ready');
    server = createGatewayServer(config);
    server.listen(config.port, config.host);
    await once(server, 'listening');
    gatewayUrl = `http://${config.host === '::1' ? '[::1]' : config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`;
  }

  stage(`Gateway ready at ${gatewayUrl}`);
  const readiness = await request('/v1/readiness');
  if (!readiness.ready) throw new Error('Gateway or backend readiness check failed');
  const run = await request('/v1/runs', 'POST', task, 30_000, privatePlannerGuidance
    ? { 'x-private-planner-guidance': Buffer.from(privatePlannerGuidance, 'utf8').toString('base64url') }
    : {});
  runId = run.runId;
  if (!/^[a-f0-9-]{36}$/.test(runId!)) throw new Error('Gateway returned an invalid run ID');
  stage(`run ${runId}`);

  const deadline = Date.now() + task.limits.timeoutMs + 30_000;
  let snapshot = run;
  while (!['completed', 'failed', 'cancelled', 'timed_out'].includes(snapshot.status)) {
    if (Date.now() >= deadline) throw new Error('Trajectory run exceeded its deadline');
    await delay(pollMs);
    snapshot = await request(`/v1/runs/${runId}`);
    await updateProgress();
    progressLine('model run', snapshot.pendingQuestion ? 'waiting for simulated user' : snapshot.status);
  }
  await updateProgress();
  finishProgress('model done', snapshot.status);

  stage('finalizing event archive');
  await request(`/v1/runs/${runId}/finalize`, 'POST');
  stage('exporting events, calls, messages, and Qwen SFT');
  const [events, calls, messages, qwen] = await Promise.all([
    request(`/v1/runs/${runId}/trajectory?format=events`),
    request(`/v1/runs/${runId}/trajectory?format=messages`),
    request(`/v1/runs/${runId}/trajectory?format=messages_list`),
    request(`/v1/runs/${runId}/trajectory?format=qwen3_5_sft`),
  ]);
  assertNoPrivateEvaluationMetadata({ events, calls, messages, qwen });

  const actualTools = (events.events ?? [])
    .filter((event: any) => event.payload?.type === 'tool.call')
    .map((event: any) => event.payload.name)
    .filter((name: unknown): name is string => typeof name === 'string');
  const semanticAudit = expectedTools
    ? auditExpectedToolCalls(expectedTools, actualTools)
    : { schemaVersion: 'career-agent.tool-semantic-audit.v1', accepted: true, expectedCallCount: 0, matchedCallCount: 0, missingCallCount: 0, orderValid: true, issues: [] };
  const planSftReady = qwen.sftReady && semanticAudit.accepted;

  const base = resolve(output, runId!);
  await Promise.all([
    writeFile(`${base}.events.json`, JSON.stringify(events, null, 2) + '\n', { flag: 'wx' }),
    writeFile(`${base}.calls.json`, JSON.stringify(calls, null, 2) + '\n', { flag: 'wx' }),
    writeFile(`${base}.messages.json`, JSON.stringify(messages, null, 2) + '\n', { flag: 'wx' }),
    writeFile(`${base}.qwen3_5_sft.json`, JSON.stringify(qwen, null, 2) + '\n', { flag: 'wx' }),
    writeFile(resolve(output, 'run.json'), JSON.stringify(snapshot, null, 2) + '\n'),
  ]);
  if (planSftReady) {
    await writeFile(`${base}.qwen3_5_sft.jsonl`, JSON.stringify({ messages: qwen.messages, tools: qwen.tools }) + '\n', { flag: 'wx' });
  } else {
    await removeTrainingJsonl();
  }

  stage('exporting generated workspace artifacts');
  const artifactExport = await exportWorkspaceArtifacts(snapshot, events);
  if (values.cleanup) await request(`/v1/runs/${runId}`, 'DELETE');
  const result = {
    runId, status: snapshot.status, reply: snapshot.reply, output,
    eventCount: events.events?.length ?? 0, callCount: calls.callCount ?? 0,
    artifactCount: artifactExport.artifacts.length, artifacts: artifactExport.artifacts,
    artifactWorkspaceError: artifactExport.workspaceError,
    sftReady: planSftReady, structuralSftReady: qwen.sftReady,
    sftIssues: [...qwen.issues, ...semanticAudit.issues], semanticAudit,
    trainingReady: events.trainingReady, trainingReasons: events.reasons,
    qwenJsonl: planSftReady ? `${base}.qwen3_5_sft.jsonl` : null,
  };
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  stage(`complete: ${result.eventCount} events, ${result.callCount} model calls, ${result.artifactCount} artifacts, SFT ready=${result.sftReady}`);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = snapshot.status === 'completed' && planSftReady ? 0 : 1;
} catch (error) {
  if (terminal) process.stdout.write('\r\x1b[2K');
  if (runId) {
    try { await request(`/v1/runs/${runId}/cancel`, 'POST'); } catch {}
  }
  console.error(error instanceof Error ? error.message : 'Backend trajectory run failed');
  process.exitCode = 2;
} finally {
  if (server) {
    await server.shutdownHarness();
    await new Promise<void>(done => { server!.close(() => done()); server!.closeAllConnections(); });
  }
}
