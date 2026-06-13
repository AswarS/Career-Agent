/**
 * Pure path-validation utilities for the generated files endpoint.
 * Exported separately so they can be unit-tested without importing the
 * NestJS controller (which requires @nestjs/common decorators at import time).
 */

import { join, normalize, sep } from 'node:path';

const VALID_SINGLE_KINDS = new Set(['image', 'audio', 'video', 'html']);

/**
 * Validates and resolves the absolute path for a generated file (image / audio / video / html).
 * Does NOT handle app files — those use resolveAppPath.
 *
 * @param baseDir  - The base user-data root directory (i.e. Network/user/)
 * @param userId   - The requesting user's ID (string)
 * @param kind     - One of "image" | "audio" | "video" | "html"
 * @param filename - The bare filename (no slashes, no traversal)
 */
export function resolveGeneratedPath(
  baseDir: string,
  userId: string,
  kind: string,
  filename: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (!VALID_SINGLE_KINDS.has(kind)) {
    return { ok: false, error: `invalid kind: ${kind}` };
  }
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { ok: false, error: 'invalid filename' };
  }

  const resolved = join(baseDir, userId, `${kind}_generated`, filename);
  const normalized = normalize(resolved);

  // Guard against path traversal that bypasses the simple string checks
  const userDir = normalize(join(baseDir, userId));
  if (!normalized.startsWith(userDir + sep) && normalized !== userDir) {
    return { ok: false, error: 'path traversal detected' };
  }

  return { ok: true, path: normalized };
}

/**
 * Validates and resolves the absolute path for a file inside an app directory.
 *
 * @param baseDir  - The base user-data root directory (i.e. Network/user/)
 * @param userId   - The requesting user's ID (string)
 * @param appId    - The app identifier (no traversal characters)
 * @param rest     - The sub-path within the app (captured by the wildcard)
 */
export function resolveAppPath(
  baseDir: string,
  userId: string,
  appId: string,
  rest: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (!appId || appId.includes('..') || appId.includes('/') || appId.includes('\\')) {
    return { ok: false, error: 'invalid appId' };
  }

  const safePart = rest ? normalize(rest).replace(/^[/\\]+/, '') : 'index.html';
  if (safePart.startsWith('..')) {
    return { ok: false, error: 'path traversal detected' };
  }

  const resolved = join(baseDir, userId, 'app_generated', appId, safePart);
  const normalized = normalize(resolved);
  const userDir = normalize(join(baseDir, userId));
  if (!normalized.startsWith(userDir + sep) && normalized !== userDir) {
    return { ok: false, error: 'path traversal detected' };
  }

  return { ok: true, path: normalized };
}
