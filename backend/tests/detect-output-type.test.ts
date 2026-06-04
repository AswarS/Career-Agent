/**
 * detect-output-type.test.ts
 *
 * Unit tests for detectOutputType utility.
 *
 * Run:
 *   cd backend && bun test tests/detect-output-type.test.ts
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectOutputType } from '../src/Network/utils/detectOutputType.js';

// ── Extension-based detection ────────────────────────────────────────────────

describe('image extensions', () => {
  for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']) {
    test(`${ext} → 'image'`, () => {
      expect(detectOutputType(`/some/path/output${ext}`)).toBe('image');
    });
  }
});

describe('video extensions', () => {
  for (const ext of ['.mp4', '.webm', '.avi', '.mov', '.mkv']) {
    test(`${ext} → 'video'`, () => {
      expect(detectOutputType(`/some/path/output${ext}`)).toBe('video');
    });
  }
});

describe('html extensions', () => {
  test('.html → "html"', () => {
    expect(detectOutputType('/some/path/page.html')).toBe('html');
  });
  test('.htm → "html"', () => {
    expect(detectOutputType('/some/path/page.htm')).toBe('html');
  });
  test('case-insensitive .HTML → "html"', () => {
    expect(detectOutputType('/some/path/PAGE.HTML')).toBe('html');
  });
});

describe('fallback extensions', () => {
  test('.ts → "file"', () => {
    expect(detectOutputType('/some/path/script.ts')).toBe('file');
  });
  test('.json → "file"', () => {
    expect(detectOutputType('/some/path/data.json')).toBe('file');
  });
  test('.pdf → "file"', () => {
    expect(detectOutputType('/some/path/doc.pdf')).toBe('file');
  });
  test('no extension → "file"', () => {
    expect(detectOutputType('/some/path/noext')).toBe('file');
  });
});

// ── Non-existent path ────────────────────────────────────────────────────────

describe('non-existent path', () => {
  test('does not throw, falls back to extension', () => {
    expect(detectOutputType('/nonexistent/path/image.png')).toBe('image');
  });
  test('no extension on non-existent path → "file"', () => {
    expect(detectOutputType('/nonexistent/path/noext')).toBe('file');
  });
});

// ── Directory-based app detection ────────────────────────────────────────────

describe('directory detection', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
  });

  function makeTmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'detect-test-'));
    tmpDirs.push(d);
    return d;
  }

  test('dir with index.html → "app"', () => {
    const d = makeTmp();
    writeFileSync(join(d, 'index.html'), '<html></html>');
    expect(detectOutputType(d)).toBe('app');
  });

  test('dir with package.json → "app"', () => {
    const d = makeTmp();
    writeFileSync(join(d, 'package.json'), '{}');
    expect(detectOutputType(d)).toBe('app');
  });

  test('dir with dist/index.html → "app"', () => {
    const d = makeTmp();
    mkdirSync(join(d, 'dist'));
    writeFileSync(join(d, 'dist', 'index.html'), '<html></html>');
    expect(detectOutputType(d)).toBe('app');
  });

  test('empty dir → "file"', () => {
    const d = makeTmp();
    expect(detectOutputType(d)).toBe('file');
  });

  test('dir with only a video file (no markers) → "file"', () => {
    const d = makeTmp();
    writeFileSync(join(d, 'clip.mp4'), '');
    expect(detectOutputType(d)).toBe('file');
  });
});
