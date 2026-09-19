import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, win32 } from 'node:path';

export interface TrainingInput {
  runId: string;
  gatewaySessionId: string;
  gateway?: { baseUrl: string; token: string; provider: 'openai' | 'anthropic'; model: string };
  input: {
    taskId: string; profile: Record<string, unknown>; query: string; modelProfile: string;
    workspace: { files: Array<{ path: string; content: string; encoding: 'utf8' | 'base64' }> };
    limits: { timeoutMs: number; maxModelCalls: number; maxUserQuestions: number };
  };
}
export type TrainingStatus = 'preparing' | 'ready' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
export interface TrainingSnapshot {
  runId: string; gatewaySessionId: string; status: TrainingStatus;
  harness: { userId: number; conversationId: string; workspaceRoot: string } | null;
  initialFiles: Array<{ path: string; bytes: number; sha256: string }>;
  error: string | null; reply: string | null;
  cleanup: 'not_requested' | 'pending' | 'completed' | 'failed';
  pendingQuestion: Record<string, unknown> | null;
  visibleHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}
export interface HarnessPorts {
  validate(input: TrainingInput): void;
  createUser(runId: string): Promise<number>;
  initializeProfile(userId: number, profile: Record<string, unknown>): Promise<void>;
  configureModel(userId: number, name: string, request: TrainingInput): Promise<void>;
  workspace(userId: number): string | Promise<string>;
  createConversation(userId: number, taskId: string, request: TrainingInput, workspaceRoot: string): Promise<string>;
  execute(binding: NonNullable<TrainingSnapshot['harness']>, query: string, signal: AbortSignal): AsyncIterable<Record<string, unknown>>;
  respond?(binding: NonNullable<TrainingSnapshot['harness']>, toolUseId: string, answers: Record<string, string>): Promise<void>;
  dispose(userId: number, conversationId?: string): Promise<void>;
  cleanup(userId: number, runId: string): Promise<void>;
}

export function validateTrainingInput(value: unknown): asserts value is TrainingInput {
  const v = value as TrainingInput;
  if (!v || !/^[a-f0-9-]{36}$/.test(v.runId) || !/^[a-f0-9-]{36}$/.test(v.gatewaySessionId)) throw new Error('Invalid training run identity');
  const i = v.input;
  if (!i || typeof i.taskId !== 'string' || !i.taskId.trim() || i.taskId.length > 128
    || typeof i.query !== 'string' || !i.query.trim() || i.query.length > 100_000
    || typeof i.modelProfile !== 'string' || !i.modelProfile.trim()
    || !i.profile || typeof i.profile !== 'object' || Array.isArray(i.profile)
    || !Array.isArray(i.workspace?.files) || i.workspace.files.length > 100) throw new Error('Invalid training task');
  if (Buffer.byteLength(JSON.stringify(v)) > 1_048_576) throw new Error('Training task exceeds 1 MiB');
  if (!Number.isInteger(i.limits?.timeoutMs) || i.limits.timeoutMs < 1000 || i.limits.timeoutMs > 86_400_000
    || !Number.isInteger(i.limits.maxModelCalls) || i.limits.maxModelCalls < 1
    || !Number.isInteger(i.limits.maxUserQuestions) || i.limits.maxUserQuestions < 0 || i.limits.maxUserQuestions > 1000) throw new Error('Invalid training limits');
  const paths: string[] = [];
  for (const f of i.workspace.files) {
    if (!f || typeof f.path !== 'string' || !f.path || f.path.length > 512 || win32.isAbsolute(f.path)
      || /[\\:\x00-\x1f<>"|?*]/.test(f.path)
      || f.path.split('/').some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Invalid workspace path');
    const canonical = f.path.normalize('NFC').toLowerCase();
    if (paths.some(p => p === canonical || p.startsWith(`${canonical}/`) || canonical.startsWith(`${p}/`))) throw new Error('Conflicting workspace paths');
    paths.push(canonical);
    if (typeof f.content !== 'string' || !['utf8', 'base64'].includes(f.encoding)) throw new Error('Invalid workspace content');
    if (f.encoding === 'base64' && Buffer.from(f.content, 'base64').toString('base64') !== f.content) throw new Error('Invalid base64');
  }
}

function inside(root: string, path: string) {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error('Workspace boundary violation');
}

/** Only used for a newly allocated user, before any agent execution. No overwrite. */
export async function seedWorkspace(root: string, files: TrainingInput['input']['workspace']['files']) {
  // Check every existing ancestor before mkdir follows any symlink/junction.
  for (let path = resolve(root);; path = dirname(path)) {
    const info = await lstat(path).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return null; });
    if (info?.isSymbolicLink()) throw new Error('Workspace ancestor is a symlink');
    if (dirname(path) === path) break;
  }
  await mkdir(root, { recursive: true });
  const canonicalRoot = await realpath(root);
  const manifest: TrainingSnapshot['initialFiles'] = [];
  for (const file of files) {
    const target = resolve(root, file.path);
    inside(resolve(root), target);
    for (const part of file.path.split('/').slice(0, -1).reduce<string[]>((all, part) => [...all, resolve(all.at(-1) ?? root, part)], [])) {
      const info = await lstat(part).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; return null; });
      if (info?.isSymbolicLink()) throw new Error('Workspace directory is a symlink');
      await mkdir(part, { recursive: true });
      inside(canonicalRoot, await realpath(part));
    }
    const bytes = Buffer.from(file.content, file.encoding);
    await writeFile(target, bytes, { flag: 'wx' });
    inside(canonicalRoot, await realpath(target));
    const diskBytes = await readFile(target);
    if (!diskBytes.equals(bytes)) throw new Error('Workspace file readback mismatch');
    manifest.push({ path: file.path, bytes: diskBytes.length, sha256: createHash('sha256').update(diskBytes).digest('hex') });
  }
  return manifest;
}

interface Entry {
  request: TrainingInput; fingerprint: string; snapshot: TrainingSnapshot; abort: AbortController;
  userId?: number; conversationId?: string; work: Promise<void>; timer: ReturnType<typeof setTimeout>;
  disposeError?: boolean;
  cleanupWork?: Promise<void>;
  questions: Map<string, { block: Record<string, unknown>; signature?: string; work?: Promise<void>; answered?: boolean }>;
  textBlocks: Set<string>;
}

export class HarnessCore {
  private entries = new Map<string, Entry>();
  private ports: HarnessPorts;
  constructor(ports: HarnessPorts) { this.ports = ports; }

  prepare(request: TrainingInput): TrainingSnapshot {
    validateTrainingInput(request);
    this.ports.validate(request);
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const existing = this.entries.get(request.runId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error('Run ID already belongs to a different task');
      return this.get(request.runId);
    }
    if (this.entries.size >= 100) throw new Error('Training run capacity reached');
    const entry: Entry = {
      request: structuredClone(request), fingerprint,
      snapshot: { runId: request.runId, gatewaySessionId: request.gatewaySessionId, status: 'preparing', harness: null, initialFiles: [], error: null, reply: null, cleanup: 'not_requested', pendingQuestion: null, visibleHistory: [] },
      questions: new Map(), textBlocks: new Set(),
      abort: new AbortController(), work: Promise.resolve(),
      timer: setTimeout(() => { void this.cancel(request.runId, true); }, request.input.limits.timeoutMs),
    };
    entry.timer.unref?.();
    this.entries.set(request.runId, entry);
    entry.work = this.prepareWork(entry);
    return this.get(request.runId);
  }

  get(id: string): TrainingSnapshot { return structuredClone(this.entry(id).snapshot); }
  private entry(id: string) { const e = this.entries.get(id); if (!e) throw new Error('Training run not found'); return e; }
  private check(e: Entry) { e.abort.signal.throwIfAborted(); }

  private async prepareWork(e: Entry) {
    try {
      e.userId = await this.ports.createUser(e.request.runId); this.check(e);
      const root = await this.ports.workspace(e.userId); this.check(e);
      e.snapshot.initialFiles = await seedWorkspace(root, e.request.input.workspace.files); this.check(e);
      await this.ports.initializeProfile(e.userId, e.request.input.profile); this.check(e);
      await this.ports.configureModel(e.userId, e.request.input.modelProfile, e.request); this.check(e);
      e.conversationId = await this.ports.createConversation(e.userId, e.request.input.taskId, e.request, resolve(root)); this.check(e);
      e.snapshot.harness = { userId: e.userId, conversationId: e.conversationId, workspaceRoot: root };
      e.snapshot.status = 'ready';
    } catch {
      if (!e.abort.signal.aborted) { e.snapshot.status = 'failed'; e.snapshot.error = 'preparation_failed'; }
      clearTimeout(e.timer);
      await this.release(e);
    }
  }

  start(id: string) {
    const e = this.entry(id);
    if (['running', 'waiting_user', 'completed'].includes(e.snapshot.status)) return this.get(id);
    if (e.snapshot.status !== 'ready') throw new Error('Training run is not ready');
    e.snapshot.status = 'running';
    e.work = this.executeWork(e);
    return this.get(id);
  }

  private async executeWork(e: Entry) {
    let completed = false;
    try {
      for await (const event of this.ports.execute(e.snapshot.harness!, e.request.input.query, e.abort.signal)) {
        this.check(e);
        if (event.type === 'error') throw new Error('Agent execution failed');
        const block = event.block as Record<string, unknown> | undefined;
        if (event.type === 'message.block.completed' && block?.type === 'text' && typeof block.text === 'string') {
          const key = `${event.messageId ?? event.message_id}:${block.id}`;
          if (!e.textBlocks.has(key)) {
            e.textBlocks.add(key);
            e.snapshot.visibleHistory.push({ role: 'assistant', content: block.text });
          }
        }
        if (block?.type === 'ask_question' && block.status === 'pending') {
          if (typeof block.toolUseId !== 'string') throw new Error('Missing question identity');
          if (!e.questions.has(block.toolUseId)) {
            if (e.questions.size >= e.request.input.limits.maxUserQuestions) {
              e.snapshot.error = 'max_user_questions_exceeded';
              e.abort.abort();
              e.snapshot.status = 'failed';
              break;
            }
            e.questions.set(block.toolUseId, { block: structuredClone(block) });
          }
          this.nextQuestion(e);
        }
        if (block?.type === 'tool_result' && e.snapshot.pendingQuestion && e.snapshot.pendingQuestion.toolUseId === block.toolUseId) {
          // An external answer must not silently bypass the training terminal.
          if (!e.questions.get(String(block.toolUseId))?.signature) throw new Error('Untracked user answer');
        }
        if (event.type === 'message.completed') {
          const raw = event.raw as Record<string, unknown> | undefined;
          if (event.status !== 'done' || event.accepted === false || raw?.fallback === true || raw?.error) throw new Error('Agent did not finish successfully');
          completed = true; e.snapshot.reply = typeof event.reply === 'string' ? event.reply : '';
        }
      }
      this.check(e);
      if (!completed) throw new Error('Stream ended without completion');
      e.snapshot.status = 'completed'; e.snapshot.pendingQuestion = null;
    } catch {
      if (!e.abort.signal.aborted) { e.snapshot.status = 'failed'; e.snapshot.error = 'execution_failed'; }
    } finally {
      clearTimeout(e.timer);
      try { await this.ports.dispose(e.userId!, e.conversationId); }
      catch { e.disposeError = true; e.snapshot.error = 'runtime_disposal_failed'; e.snapshot.status = 'failed'; }
    }
  }

  private nextQuestion(e: Entry) {
    const next = [...e.questions.values()].find(q => !q.answered);
    e.snapshot.pendingQuestion = next ? structuredClone(next.block) : null;
    e.snapshot.status = next ? 'waiting_user' : 'running';
  }

  async respond(id: string, toolUseId: string, answers: unknown) {
    const e = this.entry(id);
    const q = e.questions.get(toolUseId);
    if (!q || !answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Unknown question or invalid answers');
    const questions = q.block.questions as Array<{ question: string }>;
    const entries = Object.entries(answers);
    if (!Array.isArray(questions) || !questions.length || entries.length !== questions.length || entries.some(([key, value]) => !questions.some(item => item.question === key) || typeof value !== 'string' || !value.trim() || value.length > 10_000)) throw new Error('Invalid answers');
    const signature = JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
    if (q.signature && q.signature !== signature) throw new Error('Conflicting answer');
    if (q.answered) return this.get(id);
    if (q.work) { await q.work; return this.get(id); }
    if (e.snapshot.status !== 'waiting_user' || e.snapshot.pendingQuestion?.toolUseId !== toolUseId || !this.ports.respond) throw new Error('Question is not waiting');
    this.check(e);
    q.signature = signature;
    q.work = (async () => {
      await this.ports.respond!(e.snapshot.harness!, toolUseId, Object.fromEntries(entries) as Record<string, string>);
      q.answered = true;
      e.snapshot.visibleHistory.push({ role: 'assistant', content: JSON.stringify(questions) }, { role: 'user', content: JSON.stringify(answers) });
      if (e.snapshot.status === 'waiting_user') this.nextQuestion(e);
    })();
    try { await q.work; } finally { q.work = undefined; }
    return this.get(id);
  }

  async cancel(id: string, timedOut = false) {
    const e = this.entry(id);
    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(e.snapshot.status)) return this.get(id);
    e.snapshot.status = timedOut ? 'timed_out' : 'cancelled';
    e.abort.abort(); clearTimeout(e.timer);
    // Abort is propagated immediately; cleanup is explicit after execution settles.
    return this.get(id);
  }

  async cleanup(id: string) {
    const e = this.entry(id);
    if (e.snapshot.cleanup === 'completed') return this.get(id);
    await this.cancel(id);
    await e.work;
    await this.release(e);
    return this.get(id);
  }

  async shutdown() {
    await Promise.allSettled([...this.entries.keys()].map(id => this.cancel(id)));
    await Promise.allSettled([...this.entries.values()].map(entry => entry.work));
  }

  private release(e: Entry): Promise<void> {
    if (e.cleanupWork) return e.cleanupWork;
    e.cleanupWork = this.releaseWork(e).finally(() => { e.cleanupWork = undefined; });
    return e.cleanupWork;
  }

  private async releaseWork(e: Entry) {
    if (!e.userId || e.snapshot.cleanup === 'completed') return;
    e.snapshot.cleanup = 'pending';
    try {
      await this.ports.dispose(e.userId, e.conversationId);
      await this.ports.cleanup(e.userId, e.request.runId);
      e.snapshot.cleanup = 'completed';
    } catch { e.snapshot.cleanup = 'failed'; e.snapshot.error = 'cleanup_failed'; }
  }
}
