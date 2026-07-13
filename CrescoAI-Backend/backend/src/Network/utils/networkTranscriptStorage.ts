import { constants } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const networkRootDir = fileURLToPath(new URL('../', import.meta.url));
export const userDataRootDir = join(networkRootDir, 'user');

export function getNetworkUserDir(userId: string | number): string {
  return join(userDataRootDir, String(userId));
}

export function getNetworkUserWorkspaceDir(userId: string | number): string {
  return join(getNetworkUserDir(userId), 'workspace');
}

export function getNetworkTranscriptDir(userId: string | number): string {
  return join(getNetworkUserDir(userId), 'transcripts');
}

/**
 * Auto-memory is a dedicated user-owned capability, separate from workspace
 * and server-only transcript/profile state.
 */
export function getNetworkAutoMemoryDir(userId: string | number): string {
  return join(getNetworkUserDir(userId), 'memory', 'auto');
}

export function getNetworkUserFilesDir(userId: string | number): string {
  return join(networkRootDir, 'files', String(userId));
}

const LEGACY_SERVER_ENTRIES = new Set(['memory', 'transcripts', 'workspace']);
const LEGACY_TRANSCRIPT_FILE = /\.jsonl$/i;
const workspaceMigrationLocks = new Map<string, Promise<string>>();

/**
 * Create the isolated agent workspace and conservatively move legacy user
 * workspace entries out of the old mixed user root. Server-owned directories,
 * legacy transcript JSONL files, and symlinks/junctions are never moved.
 */
export function ensureNetworkUserWorkspaceDir(
  userId: string | number,
): Promise<string> {
  const key = String(userId);
  const pending = workspaceMigrationLocks.get(key);
  if (pending) return pending;

  const migration = migrateLegacyNetworkWorkspace(userId);
  workspaceMigrationLocks.set(key, migration);
  void migration.catch(() => {
    if (workspaceMigrationLocks.get(key) === migration) {
      workspaceMigrationLocks.delete(key);
    }
  });
  return migration;
}

async function migrateLegacyNetworkWorkspace(
  userId: string | number,
): Promise<string> {
  const userDir = getNetworkUserDir(userId);
  const workspaceDir = getNetworkUserWorkspaceDir(userId);
  await mkdir(workspaceDir, { recursive: true });

  let entries;
  try {
    entries = await readdir(userDir, { withFileTypes: true });
  } catch {
    return workspaceDir;
  }

  for (const entry of entries) {
    if (
      LEGACY_SERVER_ENTRIES.has(entry.name) ||
      entry.isSymbolicLink() ||
      (entry.isFile() && LEGACY_TRANSCRIPT_FILE.test(entry.name))
    ) {
      continue;
    }

    const source = join(userDir, entry.name);
    const destination = join(workspaceDir, entry.name);
    if (await exists(destination)) {
      continue;
    }
    try {
      await rename(source, destination);
    } catch (error) {
      if (!isExistingFileError(error) && !isDirectoryNotEmptyError(error)) {
        throw error;
      }
      // A destination created by a prior deployment wins; never overwrite it.
    }
  }

  return workspaceDir;
}

export function getNetworkTranscriptPath(
  userId: string | number,
  sessionId: string,
): string {
  return join(getNetworkTranscriptDir(userId), `${sessionId}.jsonl`);
}

export function getLegacyNetworkTranscriptPath(
  userId: string | number,
  sessionId: string,
): string {
  return join(getNetworkUserDir(userId), `${sessionId}.jsonl`);
}

export async function ensureNetworkTranscriptDir(userId: string | number): Promise<string> {
  const transcriptDir = getNetworkTranscriptDir(userId);
  await mkdir(transcriptDir, { recursive: true });
  return transcriptDir;
}

export async function ensureNetworkTranscriptFile(
  userId: string | number,
  sessionId: string,
): Promise<string> {
  const transcriptDir = await ensureNetworkTranscriptDir(userId);
  const canonicalPath = join(transcriptDir, `${sessionId}.jsonl`);

  if (await exists(canonicalPath)) {
    return canonicalPath;
  }

  const legacyPath = getLegacyNetworkTranscriptPath(userId, sessionId);
  if (await exists(legacyPath)) {
    try {
      await copyFile(legacyPath, canonicalPath, constants.COPYFILE_EXCL);
    } catch (error) {
      if (!isExistingFileError(error)) {
        throw error;
      }
    }
    return canonicalPath;
  }

  try {
    await writeFile(canonicalPath, '', { flag: 'wx' });
  } catch (error) {
    if (!isExistingFileError(error)) {
      throw error;
    }
  }
  return canonicalPath;
}

export async function appendNetworkTranscriptEvent(
  userId: string | number,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sessionFilePath = await ensureNetworkTranscriptFile(userId, sessionId);
  await appendFile(sessionFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

export async function findNetworkTranscriptFile(
  sessionId: string,
  userId?: string | number,
  options: { readOnly?: boolean } = {},
): Promise<string> {
  if (userId !== undefined) {
    const canonicalPath = getNetworkTranscriptPath(userId, sessionId);
    if (await exists(canonicalPath)) {
      return canonicalPath;
    }

    const legacyPath = getLegacyNetworkTranscriptPath(userId, sessionId);
    if (await exists(legacyPath)) {
      return options.readOnly
        ? legacyPath
        : ensureNetworkTranscriptFile(userId, sessionId);
    }

    if (!options.readOnly) {
      return ensureNetworkTranscriptFile(userId, sessionId);
    }
  }

  const found = await findExistingTranscriptBySessionId(sessionId);
  if (found) {
    return found;
  }

  if (options.readOnly) {
    throw new Error(`Network transcript ${sessionId} not found`);
  }

  return ensureNetworkTranscriptFile(userId ?? 1, sessionId);
}

async function findExistingTranscriptBySessionId(sessionId: string): Promise<string | null> {
  let userDirs;
  try {
    userDirs = await readdir(userDataRootDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const dir of userDirs) {
    if (!dir.isDirectory()) {
      continue;
    }
    const candidate = getNetworkTranscriptPath(dir.name, sessionId);
    if (await exists(candidate)) {
      return candidate;
    }
  }

  for (const dir of userDirs) {
    if (!dir.isDirectory()) {
      continue;
    }
    const candidate = getLegacyNetworkTranscriptPath(dir.name, sessionId);
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isExistingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}

function isDirectoryNotEmptyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOTEMPTY'
  );
}
