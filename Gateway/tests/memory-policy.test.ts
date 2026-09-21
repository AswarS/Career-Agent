import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Load the real backend Memory implementation without installing the entire backend.
// Only SQLite/YAML are fail-on-use stand-ins: a disabled path must never touch them.
const hooks = registerHooks({
  load(url, context, next) {
    const loaded = next(url, context);
    if (url.endsWith('/utils/stringUtils.ts')) {
      return { ...loaded, format: 'module', source: stripTypeScriptTypes(String(loaded.source), { mode: 'transform' }) };
    }
    return loaded;
  },
  resolve(specifier, context, next) {
    if (specifier === 'sqlite3') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export default { Database: class { constructor() { throw new Error("SQLITE_REACHED") } } }') };
    if (specifier === 'yaml') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export function parse() { throw new Error("YAML_REACHED") }') };
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const root = '../../CrescoAI-Backend/backend/src/';
const runtime = await import(root + 'Network/memory/conversationMemoryRuntime.ts');
const index = await import(root + 'Network/memory/conversationMemoryIndex.ts');
const storage = await import(root + 'Network/memory/conversationMemoryStorage.ts');
const { runWithSessionContext } = await import(root + 'server/SessionContext.ts');

test('disabled Conversation Memory does not read/write/index or inject reminders, including stale turn state', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'gateway-memory-'));
  t.after(async () => { hooks.deregister(); await rm(dir, { recursive: true, force: true }); });
  const ctx: any = {
    userId: '42', sessionId: 'training-session',
    config: { conversationMemoryEnabled: false, autoMemoryDir: 'auto-memory-retained' },
    conversationMemoryTurn: { enabled: true, status: 'pending', writeMode: 'required', rootDir: dir, sessionSummaryPath: join(dir, 'session.md') },
  };
  await runWithSessionContext(ctx, async () => {
    assert.equal(await runtime.getConversationMemoryStopBlocker(ctx), null);
    assert.equal(runtime.getConversationMemoryPreCompactInstructions(ctx), undefined);
    assert.equal(storage.getConversationMemoryToolPathError(join(dir, 'other.md')), null);
    await storage.commitConversationMemorySessionUpdate(join(dir, 'session.md'), 'should not parse');
    await index.syncConversationMemoryIndex(dir);
    assert.deepEqual(await index.searchConversationMemory(dir, 'query', 5), []);
    assert.deepEqual(await index.listProfileEvidenceCandidates(dir), []);
    assert.equal((await index.resolveConversationEvidenceUnits(dir, ['unit'])).size, 0);
    assert.equal(await runtime.prepareConversationMemoryTurn(ctx, 'turn', 'query'), undefined);
    assert.equal(ctx.conversationMemoryTurn, undefined);
    assert.equal(ctx.config.autoMemoryDir, 'auto-memory-retained');
  });
  assert.deepEqual(await readdir(dir), []);
  // An ordinary session still takes the real enabled storage path.
  await assert.rejects(() => index.syncConversationMemoryIndex(dir), /SQLITE_REACHED/);
});
