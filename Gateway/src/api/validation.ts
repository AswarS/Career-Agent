import { win32 } from 'node:path';
import type { CreateRunRequest, JsonObject, WorkspaceFile } from '../contracts.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(message: string): never {
  throw new ApiError(400, 'invalid_request', message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[], name: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${name}.${key} is not supported`);
}

function string(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${name} must be a non-empty string of at most ${max} characters`);
  return value;
}

function integer(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function validateCreateRun(value: unknown): CreateRunRequest {
  const input = object(value, 'request');
  keys(input, ['taskId', 'profile', 'query', 'workspace', 'modelProfile', 'userSimulator', 'limits'], 'request');
  const profile = object(input.profile, 'profile') as JsonObject;
  const workspace = input.workspace === undefined ? {} : object(input.workspace, 'workspace');
  keys(workspace, ['files'], 'workspace');
  const rawFiles = workspace.files === undefined ? [] : workspace.files;
  if (!Array.isArray(rawFiles) || rawFiles.length > 100) invalid('workspace.files must be an array of at most 100 files');
  const paths = new Set<string>();
  const files: WorkspaceFile[] = rawFiles.map((raw, i) => {
    const file = object(raw, `workspace.files[${i}]`);
    keys(file, ['path', 'encoding', 'content'], `workspace.files[${i}]`);
    const path = string(file.path, 'file.path', 512);
    if (win32.isAbsolute(path) || /[\\:\x00-\x1f<>"|?*]/.test(path)
      || path.split('/').some(part => !part || part === '.' || part === '..'
        || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      invalid('file.path must be a portable relative path without traversal or reserved names');
    }
    const canonical = path.normalize('NFC').toLowerCase();
    if (paths.has(canonical) || [...paths].some(p => p.startsWith(`${canonical}/`) || canonical.startsWith(`${p}/`))) invalid('workspace file paths conflict');
    paths.add(canonical);
    const encoding = file.encoding ?? 'utf8';
    if (encoding !== 'utf8' && encoding !== 'base64') invalid('file.encoding must be utf8 or base64');
    if (typeof file.content !== 'string') invalid('file.content must be a string');
    if (encoding === 'base64' && Buffer.from(file.content, 'base64').toString('base64') !== file.content) invalid('file.content must be canonical base64');
    return { path, encoding, content: file.content };
  });
  const limits = input.limits === undefined ? {} : object(input.limits, 'limits');
  keys(limits, ['timeoutMs', 'maxModelCalls', 'maxUserQuestions'], 'limits');
  let userSimulator: CreateRunRequest['userSimulator'] = null;
  if (input.userSimulator !== undefined && input.userSimulator !== null) {
    const simulator = object(input.userSimulator, 'userSimulator');
    keys(simulator, ['modelProfile'], 'userSimulator');
    userSimulator = { modelProfile: string(simulator.modelProfile, 'userSimulator.modelProfile', 128) };
  }
  return {
    taskId: string(input.taskId, 'taskId', 128),
    profile,
    query: string(input.query, 'query', 100_000),
    workspace: { files },
    modelProfile: string(input.modelProfile, 'modelProfile', 128),
    userSimulator,
    limits: {
      timeoutMs: integer(limits.timeoutMs, 600_000, 1000, 86_400_000, 'limits.timeoutMs'),
      maxModelCalls: integer(limits.maxModelCalls, 100, 1, 10_000, 'limits.maxModelCalls'),
      maxUserQuestions: integer(limits.maxUserQuestions, 20, 0, 1000, 'limits.maxUserQuestions'),
    },
  };
}
