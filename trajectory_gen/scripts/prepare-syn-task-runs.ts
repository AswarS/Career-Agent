import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateCreateRun } from '../../Gateway/src/api/validation.ts';
import { validateTrainingInput } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';
import { validateEduAgentWorldPersona } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/persona-materializer.ts';
import { selectByRange, TaskRangeError } from './lib/task-range.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = resolve(repoRoot, 'syn_tasks/eduagentworld_v2_171_tasks_20260921/eduagentworld_v2_171_tasks_20260921');
const packagesRoot = resolve(sourceRoot, 'packages');
const outputRoot = resolve(repoRoot, 'trajectory_gen/trajectories/syn-tasks/requests');
// Kept as the no-argument default so existing batch workflows keep generating
// the same two tasks they always did; use --range to pick others.
const defaultScenarios = [
  'hybrid_v2_edu_env_002e18dab8e4c3e75d705d7e_t02',
  'hybrid_v2_edu_env_072669e978f6827c2de37a3d_t02',
];

const { values } = parseArgs({
  options: {
    range: { type: 'string' },
    list: { type: 'boolean', default: false },
  },
});

async function orderedPackages() {
  try {
    return (await readdir(packagesRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
  } catch {
    throw new Error(`Task packages not found at ${packagesRoot}`);
  }
}

const allScenarios = await orderedPackages();

if (values.list) {
  console.log(allScenarios.map((scenarioId, index) => `${index + 1}\t${scenarioId}`).join('\n'));
  process.exit(0);
}

let scenarios: string[];
let ordinals: number[];
if (values.range) {
  let selected;
  try {
    selected = selectByRange(allScenarios, values.range);
  } catch (error) {
    if (error instanceof TaskRangeError) throw new Error(`${error.message} (1-${allScenarios.length} available)`);
    throw error;
  }
  ordinals = selected.map(entry => entry.ordinal);
  scenarios = selected.map(entry => entry.item);
} else {
  ordinals = defaultScenarios.map((scenarioId) => {
    const index = allScenarios.indexOf(scenarioId);
    if (index < 0) throw new Error(`${scenarioId}: not present under ${packagesRoot}`);
    return index + 1;
  });
  scenarios = defaultScenarios;
}

type Json = Record<string, any>;
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as Json;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function packagePath(root: string, value: unknown, name: string) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error(`${name} must be a relative package path`);
  const path = resolve(root, value);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${name} escapes the task package`);
  }
  return path;
}

await mkdir(outputRoot, { recursive: true });
const cases = [];
for (const [position, scenarioId] of scenarios.entries()) {
  const ordinal = ordinals[position];
  const packageRoot = resolve(sourceRoot, 'packages', scenarioId);
  const environment = await readJson(resolve(packageRoot, 'environment.json'));
  const task = await readJson(resolve(packageRoot, 'task.json'));
  const invocationBindings = await readJson(resolve(packageRoot, 'invocation_bindings.json'));
  if (environment.task_id !== task.id || task.scenario_id !== scenarioId) throw new Error(`${scenarioId}: task identity mismatch`);
  if (invocationBindings.task_id !== task.id || invocationBindings.schema_version !== 'eduagentworld.invocation_bindings.v1') {
    throw new Error(`${scenarioId}: invocation binding identity mismatch`);
  }
  const expectedTools = (invocationBindings.invocations ?? []).map((invocation: Json) => invocation.tool_name);
  if (!expectedTools.length || expectedTools.some((name: unknown) => typeof name !== 'string' || !name)) {
    throw new Error(`${scenarioId}: invalid invocation tool expectations`);
  }

  const persona = validateEduAgentWorldPersona(await readJson(packagePath(packageRoot, environment.persona_ref, 'persona_ref')));
  const manifest = await readJson(packagePath(packageRoot, environment.materials_manifest_ref, 'materials_manifest_ref'));
  const files = [];
  const materialRecords = [];
  for (const material of manifest.materials ?? []) {
    const local = packagePath(packageRoot, material.package_path, 'material.package_path');
    if (material.logical_path !== `/workspace/${material.package_path}`) throw new Error(`${scenarioId}: unsupported logical material path`);
    const bytes = await readFile(local);
    if (bytes.length !== material.size_bytes || sha256(bytes) !== material.sha256) throw new Error(`${scenarioId}: material checksum mismatch`);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error(`${scenarioId}: material is not canonical UTF-8`);
    files.push({ path: material.package_path, encoding: 'utf8' as const, content });
    materialRecords.push({ path: material.package_path, logicalPath: material.logical_path, bytes: bytes.length, sha256: material.sha256 });
  }

  // The agent runs with the workspace root as its cwd, so the task text alone
  // (which names materials by basename) makes it read `<root>/<name>` and fail.
  // Declare the mounted relative paths and point out that same-named files in
  // the text mean these materials, not files at the workspace root.
  const remap = (text: string) => materialRecords.reduce(
    (result, material) => result.replaceAll(material.logicalPath, material.path),
    text,
  );
  const sections = [task.task];
  for (const [key, title] of [['available_inputs', '可用输入'], ['constraints', '约束'], ['deliverables', '交付要求']] as const) {
    const lines = task[key];
    if (!Array.isArray(lines) || !lines.length) continue;
    sections.push(`${title}：\n${lines.map((line: string) => `- ${remap(line)}`).join('\n')}`);
  }
  if (files.length) {
    sections.push([
      '已装载材料位于当前用户 workspace 内，相对路径如下，请直接按这些路径读取：',
      ...materialRecords.map(material => `- ${material.path}`),
      '正文中出现的同名文件均指以上材料；材料不在 workspace 根目录下。',
    ].join('\n'));
  }

  const request = validateCreateRun({
    taskId: task.id,
    profile: persona,
    query: sections.join('\n\n'),
    workspace: { files },
    modelProfile: 'main-policy',
    userSimulator: { modelProfile: 'simulated-user' },
    limits: { timeoutMs: 1_200_000, maxModelCalls: 150, maxUserQuestions: 20 },
  });
  validateTrainingInput({
    runId: '00000000-0000-4000-8000-000000000000',
    gatewaySessionId: '00000000-0000-4000-8000-000000000001',
    input: request,
  });
  const name = `${scenarioId}.json`;
  const expectationName = `${scenarioId}.expectations.json`;
  const serializedRequest = `${JSON.stringify(request, null, 2)}\n`;
  // This sidecar is evaluator-only. Never merge it into the model-visible run
  // request: it describes the desired plan and would turn training into leakage.
  if (/invocation_bindings|validation_witness_arguments|network\.conversation:/.test(serializedRequest)) {
    throw new Error(`${scenarioId}: private invocation metadata leaked into request`);
  }
  await Promise.all([
    writeFile(resolve(outputRoot, name), serializedRequest, 'utf8'),
    writeFile(resolve(outputRoot, expectationName), `${JSON.stringify({
      schemaVersion: 'career-agent.private-tool-expectations.v1',
      taskId: task.id,
      expectedTools,
    }, null, 2)}\n`, 'utf8'),
  ]);
  cases.push({ ordinal, scenarioId, taskId: task.id, title: task.title, request: name, personaFields: Object.keys(persona.product_fields).length, materials: materialRecords });
}

await writeFile(resolve(dirname(outputRoot), 'manifest.json'), `${JSON.stringify({
  schemaVersion: 'career-agent.syn-task-trajectory-cases.v1',
  sourceRoot: relative(repoRoot, sourceRoot).replaceAll('\\', '/'),
  packageCount: allScenarios.length,
  range: values.range ?? null,
  cases,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputRoot,
  range: values.range ?? null,
  packageCount: allScenarios.length,
  cases: cases.length,
  ordinals,
  taskIds: cases.map(item => item.taskId),
}, null, 2));
