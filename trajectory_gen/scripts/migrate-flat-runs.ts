import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const runsRoot = resolve(repoRoot, 'trajectory_gen/trajectories/syn-tasks/runs');
const legacyRoot = resolve(repoRoot, 'trajectory_gen/trajectories/legacy-time-batches');
const batchPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

function inside(root: string, target: string) {
  const value = relative(root, target);
  if (value === '..' || value.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(value)) {
    throw new Error(`Path escapes migration root: ${target}`);
  }
}

async function directories(root: string) {
  return (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
}

async function readJson(file: string) { return JSON.parse(await readFile(file, 'utf8')); }

async function restoreWriteArtifacts(runDir: string, runId: string) {
  const events = await readJson(resolve(runDir, `${runId}.events.json`));
  const run = await readJson(resolve(runDir, 'run.json'));
  const successful = new Set((events.events ?? [])
    .filter((event: any) => event.payload?.type === 'tool.result' && event.payload.isError !== true)
    .map((event: any) => event.payload.toolUseId));
  const artifacts = [];
  const destination = resolve(runDir, 'artifacts');
  for (const event of events.events ?? []) {
    if (event.payload?.type !== 'tool.call' || event.payload.name !== 'Write' || !successful.has(event.payload.toolUseId)) continue;
    let input = event.payload.input;
    if (typeof input === 'string') { try { input = JSON.parse(input); } catch { continue; } }
    if (!input || typeof input.file_path !== 'string' || typeof input.content !== 'string') continue;
    const normalized = input.file_path.replaceAll('\\', '/');
    const markerIndex = normalized.lastIndexOf('/workspace/');
    if (markerIndex < 0) continue;
    const artifactPath = normalized.slice(markerIndex + '/workspace/'.length);
    if (!artifactPath || artifactPath.split('/').some((part: string) => !part || part === '.' || part === '..')) continue;
    const target = resolve(destination, artifactPath);
    inside(destination, target);
    const bytes = Buffer.from(input.content, 'utf8');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    artifacts.push({ path: artifactPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: 'write_event_migration', change: 'created' });
  }
  if (typeof run.reply === 'string' && run.reply.trim()) {
    const bytes = Buffer.from(run.reply, 'utf8');
    await mkdir(destination, { recursive: true });
    await writeFile(resolve(destination, '_final_response.md'), bytes);
    artifacts.push({ path: '_final_response.md', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: 'final_response', change: 'created' });
  }
  await writeFile(resolve(runDir, 'artifacts.json'), JSON.stringify({ schemaVersion: 'career-agent.trajectory-artifacts.v1', workspaceError: 'historical workspace already cleaned', artifacts }, null, 2) + '\n');
  return artifacts.length;
}

await mkdir(runsRoot, { recursive: true });
const batches = (await directories(runsRoot)).filter(name => batchPattern.test(name)).sort();
const selected = new Map<string, { batch: string; source: string; summary: any }>();
for (const batch of batches) {
  const batchRoot = resolve(runsRoot, batch);
  inside(runsRoot, batchRoot);
  for (const scenarioId of await directories(batchRoot)) {
    const source = resolve(batchRoot, scenarioId);
    try {
      const summary = await readJson(resolve(source, 'summary.json'));
      if (summary.status === 'completed' && summary.sftReady === true) selected.set(scenarioId, { batch, source, summary });
    } catch {}
  }
}

for (const [scenarioId, item] of selected) {
  const destination = resolve(runsRoot, scenarioId);
  inside(runsRoot, destination);
  try { await stat(destination); throw new Error(`Flat task directory already exists: ${destination}`); }
  catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  await cp(item.source, destination, { recursive: true, errorOnExist: true });
  const artifactCount = await restoreWriteArtifacts(destination, item.summary.runId);
  console.log(`materialized ${scenarioId} from ${item.batch} (${artifactCount} artifacts)`);
}

await mkdir(legacyRoot, { recursive: true });
for (const batch of batches) {
  const source = resolve(runsRoot, batch);
  const destination = resolve(legacyRoot, batch);
  inside(runsRoot, source);
  inside(legacyRoot, destination);
  await rename(source, destination);
  console.log(`archived legacy batch ${batch}`);
}

for (const legacyName of ['legacy', '.gitkeep']) {
  const source = resolve(runsRoot, legacyName);
  try {
    await stat(source);
    const destination = resolve(legacyRoot, legacyName === 'legacy' ? 'pre-flat-legacy' : legacyName);
    inside(runsRoot, source);
    inside(legacyRoot, destination);
    await rename(source, destination);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

for (const scenarioId of await directories(runsRoot)) {
  if (batchPattern.test(scenarioId)) continue;
  const runDir = resolve(runsRoot, scenarioId);
  try {
    const summary = await readJson(resolve(runDir, 'summary.json'));
    await restoreWriteArtifacts(runDir, summary.runId);
  } catch {}
}
