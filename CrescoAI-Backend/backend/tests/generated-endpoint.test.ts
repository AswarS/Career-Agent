/**
 * generated-endpoint.test.ts
 *
 * Unit tests for the path validation / resolution logic in generated.controller.ts.
 * These tests run without a NestJS server — they exercise the exported pure functions.
 */

import { describe, test, expect } from 'bun:test';
import { join, sep } from 'node:path';
// Import the pure validation helpers via their re-export from the controller.
// The controller itself is not instantiated here — only the exported functions are called.
import { resolveGeneratedPath } from '../src/Network/modules/generated/generated.utils.js';

const ROOT = '/fake/root/user';
const USER_ID = '42';

// ---------------------------------------------------------------------------
// resolveGeneratedPath — happy paths
// ---------------------------------------------------------------------------

describe('resolveGeneratedPath – valid inputs', () => {
  test('returns correct path for kind=image', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'image', 'photo.png');
    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrowing
    expect(result.path).toBe(join(ROOT, USER_ID, 'image_generated', 'photo.png'));
  });

  test('returns correct path for kind=video', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'video', 'clip.mp4');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(join(ROOT, USER_ID, 'video_generated', 'clip.mp4'));
  });

  test('returns correct path for kind=html', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'html', 'index.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(join(ROOT, USER_ID, 'html_generated', 'index.html'));
  });
});

// ---------------------------------------------------------------------------
// resolveGeneratedPath — invalid kind
// ---------------------------------------------------------------------------

describe('resolveGeneratedPath – invalid kind', () => {
  test('rejects kind=app (handled by a separate endpoint)', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'app', 'myapp');
    expect(result.ok).toBe(false);
  });

  test('rejects unknown kind', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'document', 'file.pdf');
    expect(result.ok).toBe(false);
  });

  test('rejects empty kind', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, '', 'file.png');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveGeneratedPath — filename traversal
// ---------------------------------------------------------------------------

describe('resolveGeneratedPath – path traversal in filename', () => {
  test('rejects filename with ..', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'image', '../secret.png');
    expect(result.ok).toBe(false);
  });

  test('rejects filename with forward slash', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'image', 'sub/secret.png');
    expect(result.ok).toBe(false);
  });

  test('rejects filename with backslash', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'image', 'sub\\secret.png');
    expect(result.ok).toBe(false);
  });

  test('rejects filename that is just ..', () => {
    const result = resolveGeneratedPath(ROOT, USER_ID, 'video', '..');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveGeneratedPath — resolved path outside user directory
// ---------------------------------------------------------------------------

describe('resolveGeneratedPath – path resolves outside user dir', () => {
  test('trusted userId keeps the resolved path inside the user-scoped directory', () => {
    // With a legitimate userId the resolved path is always inside the user dir.
    const result = resolveGeneratedPath('/base/root', '42', 'image', 'photo.png');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path.startsWith(`${join('/base/root', '42')}${sep}`)).toBe(true);
  });

  test('filename that is only dots is caught by the filename guard', () => {
    // A bare '..' contains '..' so the filename check catches it before path resolution.
    const result = resolveGeneratedPath('/base/root', '42', 'image', '..');
    expect(result.ok).toBe(false);
  });

  test('each user gets an isolated path — cross-user reads are prevented by separate userId scoping', () => {
    const r1 = resolveGeneratedPath('/data', '10', 'video', 'clip.mp4');
    const r2 = resolveGeneratedPath('/data', '20', 'video', 'clip.mp4');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.path).not.toBe(r2.path);
    expect(r1.path.includes(`${sep}10${sep}`)).toBe(true);
    expect(r2.path.includes(`${sep}20${sep}`)).toBe(true);
  });
});
