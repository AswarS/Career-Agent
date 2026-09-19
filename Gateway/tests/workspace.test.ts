import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertNetworkUserWorkspaceBinding, ensureNetworkUserWorkspaceDir, getNetworkUserDir, getNetworkUserWorkspaceDir, userDataRootDir } from '../../CrescoAI-Backend/backend/src/Network/utils/networkTranscriptStorage.ts';
import { HarnessCore, seedWorkspace } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';
import type { TrainingInput } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/harness-core.ts';

async function identity(t: TestContext) {
  // No database is touched. Use unique high test IDs and never remove a pre-existing directory.
  const id = randomInt(1_000_000_000_000, 2_000_000_000_000);
  const root = resolve(getNetworkUserDir(id));
  assert.ok(root.startsWith(resolve(userDataRootDir) + sep));
  assert.equal(await stat(root).then(() => true, (e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return false; }), false);
  let owns = false;
  t.after(async () => { if (owns) await rm(root, { recursive: true, force: true }); });
  return { id, root, own: () => { owns = true; } };
}
async function until(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > end) throw new Error('workspace test timeout'); await delay(5); }
}

test('harness uses real backend user workspaces and seeds binary/nested files before Profile and execution', async t => {
  const a = await identity(t), b = await identity(t); const available = [a, b]; let next = 0;
  const profiles: number[] = [], executions: number[] = [];
  const core = new HarnessCore({
    validate: () => {}, createUser: async () => available[next++]!.id,
    workspace: async id => { const root = await ensureNetworkUserWorkspaceDir(id, { requireNewUserDirectory: true }); available.find(v => v.id === id)!.own(); return root; },
    initializeProfile: async id => { assert.ok((await readFile(join(getNetworkUserWorkspaceDir(id), 'nested/resume.md'), 'utf8')).includes(String(id))); profiles.push(id); },
    configureModel: async () => {},
    createConversation: async (id, _task, _input, root) => { assert.equal(root, resolve(getNetworkUserWorkspaceDir(id))); assert.ok(profiles.includes(id)); return randomUUID(); },
    execute: async function* (binding) {
      assert.equal(binding.workspaceRoot, getNetworkUserWorkspaceDir(binding.userId));
      assert.equal(await readFile(resolve(binding.workspaceRoot, 'nested/resume.md'), 'utf8'), `用户 ${binding.userId}`);
      assert.deepEqual(await readFile(resolve(binding.workspaceRoot, 'asset.bin')), Buffer.from([0, 255, 1, 128]));
      executions.push(binding.userId); yield { type: 'message.completed', status: 'done', reply: 'ok' };
    }, dispose: async () => {}, cleanup: async () => {},
  });
  t.after(() => core.shutdown());
  const requests = available.map(({ id }) => ({ runId: randomUUID(), gatewaySessionId: randomUUID(), input: {
    taskId: 'physical-workspace', profile: {}, query: 'read files', modelProfile: 'test',
    workspace: { files: [{ path: 'nested/resume.md', encoding: 'utf8', content: `用户 ${id}` }, { path: 'asset.bin', encoding: 'base64', content: Buffer.from([0, 255, 1, 128]).toString('base64') }] },
    limits: { timeoutMs: 3000, maxModelCalls: 2, maxUserQuestions: 0 },
  } } as TrainingInput));
  requests.forEach(r => core.prepare(r));
  await until(() => requests.every(r => core.get(r.runId).status === 'ready'));
  for (const request of requests) {
    const snapshot = core.get(request.runId);
    for (const file of snapshot.initialFiles) {
      const bytes = await readFile(join(snapshot.harness!.workspaceRoot, file.path));
      assert.equal(file.bytes, bytes.length); assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    core.start(request.runId);
  }
  await until(() => requests.every(r => core.get(r.runId).status === 'completed'));
  assert.equal(executions.length, 2);
});

test('training refuses an existing user root without migrating it; normal users retain legacy migration', async t => {
  const f = await identity(t); await mkdir(f.root, { recursive: true }); f.own();
  await writeFile(join(f.root, 'legacy.txt'), 'preserve me');
  await assert.rejects(ensureNetworkUserWorkspaceDir(f.id, { requireNewUserDirectory: true }));
  assert.equal(await readFile(join(f.root, 'legacy.txt'), 'utf8'), 'preserve me');
  const workspace = await ensureNetworkUserWorkspaceDir(f.id);
  assert.equal(await readFile(join(workspace, 'legacy.txt'), 'utf8'), 'preserve me');
});

test('concurrent training claims cannot share a user directory', async t => {
  const f = await identity(t);
  const results = await Promise.allSettled([1, 2].map(async () => { const root = await ensureNetworkUserWorkspaceDir(f.id, { requireNewUserDirectory: true }); f.own(); return root; }));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});

test('reallocated ID rebuilds a removed workspace instead of returning a stale cached directory', async t => {
  const f = await identity(t);
  await ensureNetworkUserWorkspaceDir(f.id, { requireNewUserDirectory: true }); f.own();
  await rm(f.root, { recursive: true });
  const root = await ensureNetworkUserWorkspaceDir(f.id, { requireNewUserDirectory: true });
  assert.ok((await stat(root)).isDirectory());
});

test('seeding refuses overwrites and retains existing file bytes', async t => {
  const f = await identity(t); const root = await ensureNetworkUserWorkspaceDir(f.id, { requireNewUserDirectory: true }); f.own();
  await writeFile(join(root, 'same.txt'), 'existing');
  await assert.rejects(seedWorkspace(root, [{ path: 'same.txt', encoding: 'utf8', content: 'replacement' }]));
  assert.equal(await readFile(join(root, 'same.txt'), 'utf8'), 'existing');
});

test('runtime binding refuses project root, another user and a mismatched prepared path', () => {
  const root = getNetworkUserWorkspaceDir(123);
  assert.doesNotThrow(() => assertNetworkUserWorkspaceBinding(123, root, resolve(root, '.')));
  assert.throws(() => assertNetworkUserWorkspaceBinding(123, root, process.cwd()), /differs/);
  assert.throws(() => assertNetworkUserWorkspaceBinding(123, root, getNetworkUserWorkspaceDir(456)), /differs/);
  assert.throws(() => assertNetworkUserWorkspaceBinding(123, getNetworkUserWorkspaceDir(456), root), /differs/);
});
