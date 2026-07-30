import { realpath } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path'
import type {
  NetworkReadOnlyFileTool,
  SessionFilesystemRoot,
  SessionReadOnlyRoot,
} from './filesystemPolicyTypes.js'

/**
 * Normalize a path for boundary comparisons without touching the filesystem.
 * Windows paths are case-insensitive and both slash styles are normalized by
 * node:path before comparison.
 */
export function normalizePathForSecurity(path: string): string | null {
  if (!path || path.includes('\0') || !isAbsolute(path)) {
    return null
  }

  const normalized = normalize(path)
    .replace(/[/\\]+$/, '')
    .normalize('NFC')

  if (!normalized) {
    return null
  }

  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** Exact-or-descendant comparison; sibling prefixes such as root-evil fail. */
export function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePathForSecurity(path)
  const normalizedRoot = normalizePathForSecurity(root)
  if (!normalizedPath || !normalizedRoot) {
    return false
  }

  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}${sep}`)
  )
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function isUncPath(path: string): boolean {
  return path.startsWith('\\\\') || path.startsWith('//')
}

/**
 * Resolve symlinks/junctions for an existing target. For a target that does
 * not exist yet, resolve its nearest existing ancestor and append the missing
 * suffix. This closes write-through-symlink escapes without requiring the new
 * file to exist before its permission check.
 */
export async function canonicalizePathForSecurity(
  path: string,
  cwd: string,
): Promise<string | null> {
  if (!path || path.includes('\0') || isUncPath(path)) {
    return null
  }

  const absolutePath = normalize(isAbsolute(path) ? path : resolve(cwd, path))
  if (!isAbsolute(absolutePath) || isUncPath(absolutePath)) {
    return null
  }

  let cursor = absolutePath
  const missingSegments: string[] = []

  while (true) {
    try {
      const existingRealPath = await realpath(cursor)
      return normalize(join(existingRealPath, ...missingSegments.reverse()))
        .normalize('NFC')
    } catch (error) {
      if (!isMissingPathError(error)) {
        return null
      }
      const parent = dirname(cursor)
      if (parent === cursor) {
        return null
      }
      missingSegments.push(cursor.slice(parent.length).replace(/^[/\\]+/, ''))
      cursor = parent
    }
  }
}

export type WorkspacePathAccess = 'read' | 'write'

export type WorkspacePathDecision =
  | {
      allowed: true
      canonicalPath: string
      rootType:
        | 'workspace'
        | 'memory'
        | 'conversation-memory'
        | 'user-input'
        | 'shared'
        | 'skill'
      rootId?: string
    }
  | {
      allowed: false
      reason: string
      rootType?: 'service' | 'user-input' | 'shared' | 'skill'
      rootId?: string
    }

export async function checkSessionWorkspacePath(
  path: string,
  access: WorkspacePathAccess,
  options: {
    cwd: string
    workspaceRoot: string
    autoMemoryDir?: string
    conversationMemoryDir?: string
    conversationMemorySessionFile?: string
    toolName?: string
    userReadOnlyRoots?: Iterable<SessionReadOnlyRoot>
    sharedReadOnlyRoots?: Iterable<SessionReadOnlyRoot>
    skillReadOnlyRoots?: Iterable<string>
    serviceOnlyRoots?: Iterable<SessionFilesystemRoot>
  },
): Promise<WorkspacePathDecision> {
  const canonicalPath = await canonicalizePathForSecurity(path, options.cwd)
  if (!canonicalPath) {
    return { allowed: false, reason: 'Path could not be safely canonicalized' }
  }

  // Explicit service-only denies always win, even if a future allowlist is
  // accidentally configured with an overlapping parent directory.
  for (const grant of options.serviceOnlyRoots ?? []) {
    const canonicalRoot = await canonicalizePathForSecurity(
      grant.root,
      options.cwd,
    )
    if (canonicalRoot && isPathWithinRoot(canonicalPath, canonicalRoot)) {
      return {
        allowed: false,
        reason: `Service-only resource "${grant.id}" is not accessible to agents`,
        rootType: 'service',
        rootId: grant.id,
      }
    }
  }

  // Memory is intentionally classified separately from the ordinary workspace
  // so permission audit output preserves its user-scoped purpose.
  if (options.autoMemoryDir) {
    const memoryRoot = await canonicalizePathForSecurity(
      options.autoMemoryDir,
      options.cwd,
    )
    if (memoryRoot && isPathWithinRoot(canonicalPath, memoryRoot)) {
      return {
        allowed: true,
        canonicalPath,
        rootType: 'memory',
        rootId: 'user-auto-memory',
      }
    }
  }

  if (options.conversationMemoryDir) {
    const memoryRoot = await canonicalizePathForSecurity(
      options.conversationMemoryDir,
      options.cwd,
    )
    if (memoryRoot && isPathWithinRoot(canonicalPath, memoryRoot)) {
      const relativePath = relative(memoryRoot, canonicalPath)
      const normalizedRelative = relativePath.split(sep).join('/')
      const isDirectSessionSummary =
        /^sessions\/[A-Za-z0-9_-]{8,128}\.md$/.test(normalizedRelative)

      if (access === 'read' && options.toolName === 'Read') {
        if (isDirectSessionSummary) {
          return {
            allowed: true,
            canonicalPath,
            rootType: 'conversation-memory',
            rootId: 'conversation-memory-session',
          }
        }
      }

      if (access === 'write' && isDirectSessionSummary) {
        const writablePath = options.conversationMemorySessionFile
          ? await canonicalizePathForSecurity(
              options.conversationMemorySessionFile,
              options.cwd,
            )
          : null
        if (
          writablePath &&
          normalizePathForSecurity(writablePath) ===
            normalizePathForSecurity(canonicalPath)
        ) {
          return {
            allowed: true,
            canonicalPath,
            rootType: 'conversation-memory',
            rootId: 'current-conversation-memory-session',
          }
        }
      }

      return {
        allowed: false,
        reason:
          'Conversation memory permits Read on direct session summaries and Write/Edit only on the current session summary',
        rootType: 'service',
        rootId: 'conversation-memory-protected',
      }
    }
  }

  const workspaceRoot = await canonicalizePathForSecurity(
    options.workspaceRoot,
    options.cwd,
  )
  if (workspaceRoot && isPathWithinRoot(canonicalPath, workspaceRoot)) {
    return {
      allowed: true,
      canonicalPath,
      rootType: 'workspace',
      rootId: 'user-workspace',
    }
  }

  const readOnlyRootGroups: Array<{
    type: 'user-input' | 'shared'
    roots: Iterable<SessionReadOnlyRoot> | undefined
  }> = [
    { type: 'user-input', roots: options.userReadOnlyRoots },
    { type: 'shared', roots: options.sharedReadOnlyRoots },
  ]

  for (const group of readOnlyRootGroups) {
    for (const grant of group.roots ?? []) {
      const canonicalRoot = await canonicalizePathForSecurity(
        grant.root,
        options.cwd,
      )
      if (canonicalRoot && isPathWithinRoot(canonicalPath, canonicalRoot)) {
        if (access === 'write') {
          return {
            allowed: false,
            reason: `${group.type} resources are read-only`,
            rootType: group.type,
            rootId: grant.id,
          }
        }
        if (
          !options.toolName ||
          !grant.allowedTools.includes(options.toolName as NetworkReadOnlyFileTool)
        ) {
          return {
            allowed: false,
            reason: `Tool "${options.toolName ?? 'unknown'}" is not allowed for ${group.type} resources`,
            rootType: group.type,
            rootId: grant.id,
          }
        }
        if (
          grant.pathPolicy === 'direct-session-jsonl' &&
          !isDirectSessionTranscript(canonicalPath, canonicalRoot)
        ) {
          return {
            allowed: false,
            reason:
              'Transcript access is limited to direct, safely named JSONL session files',
            rootType: group.type,
            rootId: grant.id,
          }
        }
        return {
          allowed: true,
          canonicalPath,
          rootType: group.type,
          rootId: grant.id,
        }
      }
    }
  }

  for (const root of options.skillReadOnlyRoots ?? []) {
    const canonicalRoot = await canonicalizePathForSecurity(root, options.cwd)
    if (canonicalRoot && isPathWithinRoot(canonicalPath, canonicalRoot)) {
      if (access === 'write') {
        return {
          allowed: false,
          reason: 'skill resources are read-only',
          rootType: 'skill',
        }
      }
      if (
        !options.toolName ||
        !['Read', 'Glob', 'Grep', 'LS'].includes(options.toolName)
      ) {
        return {
          allowed: false,
          reason: `Tool "${options.toolName ?? 'unknown'}" is not allowed for skill resources`,
          rootType: 'skill',
        }
      }
      return { allowed: true, canonicalPath, rootType: 'skill' }
    }
  }

  return {
    allowed: false,
    reason:
      'Path is outside the current user workspace and approved read-only roots',
  }
}

function isDirectSessionTranscript(path: string, root: string): boolean {
  const relativePath = relative(root, path)
  return (
    relativePath === basename(path) &&
    /^[A-Za-z0-9_-]{8,128}\.jsonl$/i.test(relativePath)
  )
}
