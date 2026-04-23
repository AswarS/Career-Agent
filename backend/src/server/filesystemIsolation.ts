/**
 * filesystemIsolation.ts — Path traversal prevention for multi-user server mode
 *
 * Ensures that file operations in one session cannot escape the session's
 * workspace directory. Every file path passed to tools is resolved and
 * validated against the session's cwd before execution.
 */

import { resolve, normalize, relative, sep } from 'node:path'

/**
 * Validate that a target path is within the allowed workspace.
 * Returns the resolved absolute path if safe, throws otherwise.
 *
 * @param targetPath - The path to validate (may be relative or absolute)
 * @param workspaceRoot - The allowed workspace root directory
 * @returns The resolved absolute path
 * @throws Error if the path escapes the workspace
 */
export function validatePath(
  targetPath: string,
  workspaceRoot: string,
): string {
  const resolved = resolve(workspaceRoot, targetPath)
  const normalizedRoot = normalize(workspaceRoot)

  // Ensure resolved path starts with workspaceRoot
  const relativePath = relative(normalizedRoot, resolved)

  // If the relative path starts with .. or is absolute, it escapes the root
  if (relativePath.startsWith('..') || relativePath.startsWith(sep) || relativePath.startsWith('/')) {
    throw new Error(
      `Path traversal detected: "${targetPath}" resolves to "${resolved}" ` +
      `which is outside workspace "${normalizedRoot}"`,
    )
  }

  return resolved
}

/**
 * Check if a path is within the workspace without throwing.
 * Useful for conditional logic where you want to skip operations silently.
 */
export function isPathWithinWorkspace(
  targetPath: string,
  workspaceRoot: string,
): boolean {
  try {
    validatePath(targetPath, workspaceRoot)
    return true
  } catch {
    return false
  }
}

/**
 * Validate multiple paths at once. Returns the resolved paths or throws
 * on the first violation.
 */
export function validatePaths(
  paths: string[],
  workspaceRoot: string,
): string[] {
  return paths.map(p => validatePath(p, workspaceRoot))
}
