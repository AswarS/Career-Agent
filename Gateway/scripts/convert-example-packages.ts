import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { validateCreateRun } from '../src/api/validation.ts';
import { normalizeProfileRecord, hasProfileInputFields } from '../../CrescoAI-Backend/backend/src/Network/modules/profile/profile.types.ts';
import { validateTrainingInput } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';

// Offline conversion only: never submits a run or reads model credentials.
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const source = resolve(examples, 'task_environment_packages_llm_5/packages');
const output = resolve(examples, 'cases');
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const join = (value: unknown) => Array.isArray(value) ? value.join('\n') : String(value ?? '');
const entries = [];
const pending = [];

for (const entry of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const directory = resolve(source, entry.name);
  const task = await json(resolve(directory, 'task.json'));
  const persona = await json(resolve(directory, 'persona.json'));
  const manifest = await json(resolve(directory, 'materials_manifest.json'));
  const base = persona.base_profile;
  const fields = persona.product_fields;
  const profile = normalizeProfileRecord({
    fullName: base.name,
    displayName: base.name,
    currentCity: base.currentCity,
    currentRole: base.currentRole,
    employmentStatus: base.currentStatus,
    educationBackground: JSON.stringify(base.educationBackground, null, 2),
    workExperience: join(fields['career.workExperience']),
    projectExperience: join(fields['career.projectExperience']),
    skills: fields['career.skills'],
    targetIndustries: fields['job.targetIndustries'],
    targetRole: join(fields['job.targetRoles']),
    targetCity: join(fields['job.locations']),
    expectedSalary: fields['job.salaryExpectation'],
    jobSearchStatus: fields['job.searchStatus'],
    constraints: fields['job.exclusions'],
    workPreferences: fields['job.workModes'],
    careerGoal: fields['career.direction'],
    learningPlan: JSON.stringify(Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith('learning.'))), null, 2),
    // The legacy training input cannot represent every product-v2 field directly.
    // Keep all supplied persona facts in a supported text field for both agents.
    resumeSummary: `${fields['profile.summary'] ?? ''}\n\n完整原始画像事实（base_profile / product_fields）：\n${JSON.stringify({ base_profile: base, product_fields: fields }, null, 2)}`,
  });
  if (!hasProfileInputFields(profile)) throw new Error(`${entry.name}: unsupported profile`);
  const files = [];
  const materials = [];
  for (const material of manifest.materials) {
    const path = material.package_path;
    const local = resolve(directory, path);
    const rel = relative(directory, local);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Material escapes package');
    if (material.logical_path !== `/workspace/${path}`) throw new Error('Unexpected logical material path');
    const bytes = await readFile(local);
    if (sha256(bytes) !== material.sha256 || bytes.length !== material.size_bytes) throw new Error(`${path}: source checksum mismatch`);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error(`${path}: invalid UTF-8`);
    files.push({ path, encoding: 'utf8', content });
    materials.push({ path, sourceLogicalPath: material.logical_path, sha256: sha256(bytes), sizeBytes: bytes.length });
  }
  const remap = (text: string) => materials.reduce((result, material) => result.replaceAll(material.sourceLogicalPath, material.path), text);
  const sections = [task.task];
  for (const [key, title] of [['available_inputs', '可用输入'], ['constraints', '约束'], ['deliverables', '交付要求']]) {
    if (task[key]?.length) sections.push(`${title}：\n${task[key].map((line: string) => `- ${remap(line)}`).join('\n')}`);
  }
  if (files.length) sections.push('上述材料路径相对于当前用户 workspace；正文中的同名文件均指上述 materials/ 目录中的文件。');
  const request = validateCreateRun({
    taskId: task.id, profile, query: sections.join('\n\n'), workspace: { files },
    modelProfile: 'main-policy', userSimulator: { modelProfile: 'simulated-user' },
    limits: { timeoutMs: 600000, maxModelCalls: 100, maxUserQuestions: 20 },
  });
  const serialized = JSON.stringify(request, null, 2) + '\n';
  validateTrainingInput({ runId: randomUUID(), gatewaySessionId: randomUUID(), input: request });
  if (Buffer.byteLength(serialized) > 1_000_000) throw new Error('Case exceeds conservative request size limit');
  pending.push({ name: `${entry.name}.json`, content: serialized });
  entries.push({
    case: `${entry.name}.json`, taskId: task.id, title: task.title,
    source: `../task_environment_packages_llm_5/packages/${entry.name}`,
    acceptanceCriteria: task.acceptance_criteria, materials,
    requiresLiveJobResearch: entry.name === 'opportunity_resume_tailoring',
    requestBytes: Buffer.byteLength(serialized),
  });
}
await mkdir(output, { recursive: true });
for (const file of pending) await writeFile(resolve(output, file.name), file.content, 'utf8');
await writeFile(resolve(output, 'index.json'), JSON.stringify({
  schemaVersion: 'gateway.example-cases.v1',
  description: 'Offline source mapping and evaluation criteria. Do not submit this index as a run or put it in the agent workspace.',
  cases: entries,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ cases: entries.length, materials: entries.reduce((n, entry) => n + entry.materials.length, 0), schemaValid: true, backendInputValid: true, sourceChecksumsValid: true, output }, null, 2));
