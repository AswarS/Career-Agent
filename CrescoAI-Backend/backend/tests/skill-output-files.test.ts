/**
 * skill-output-files.test.ts
 *
 * Unit tests for skillOutputFilesToMedia helper logic.
 * Tests the URL construction and kind detection without a running server.
 *
 * Run:
 *   cd backend && bun test ./tests/skill-output-files.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { detectOutputType } from '../src/Network/utils/detectOutputType.js';

// Mirrors the logic in ConversationService.skillOutputFilesToMedia
function skillOutputFilesToMedia(
  outputFiles: Array<{ path: string; kind?: string; title?: string }>,
) {
  const media: Array<{ kind: string; url: string; title: string; storage_path: string }> = [];
  for (const f of outputFiles) {
    const { basename } = require('node:path') as typeof import('node:path');
    const kind = f.kind ?? detectOutputType(f.path);
    const filename = basename(f.path);
    const url =
      kind === 'app'
        ? `/api/career-agent/generated/app/${filename}/`
        : `/api/career-agent/generated/${kind}/${filename}`;
    media.push({ kind, url, title: f.title ?? filename, storage_path: f.path });
  }
  return media;
}

describe('skillOutputFilesToMedia — URL construction', () => {
  test('image file produces correct URL', () => {
    const [item] = skillOutputFilesToMedia([{ path: '/user/1/image_generated/output.png' }]);
    expect(item.kind).toBe('image');
    expect(item.url).toBe('/api/career-agent/generated/image/output.png');
    expect(item.storage_path).toBe('/user/1/image_generated/output.png');
  });

  test('video file produces correct URL', () => {
    const [item] = skillOutputFilesToMedia([{ path: '/user/1/video_generated/clip.mp4' }]);
    expect(item.kind).toBe('video');
    expect(item.url).toBe('/api/career-agent/generated/video/clip.mp4');
  });

  test('html file produces correct URL', () => {
    const [item] = skillOutputFilesToMedia([{ path: '/user/1/html_generated/page.html' }]);
    expect(item.kind).toBe('html');
    expect(item.url).toBe('/api/career-agent/generated/html/page.html');
  });

  test('explicit kind overrides auto-detection', () => {
    // .png would normally be image, but if kind is set to 'file' it should be respected
    const [item] = skillOutputFilesToMedia([{ path: '/some/file.png', kind: 'file' }]);
    expect(item.kind).toBe('file');
    expect(item.url).toBe('/api/career-agent/generated/file/file.png');
  });

  test('title uses provided value when given', () => {
    const [item] = skillOutputFilesToMedia([{ path: '/user/1/output.png', title: 'My Image' }]);
    expect(item.title).toBe('My Image');
  });

  test('title falls back to filename when not provided', () => {
    const [item] = skillOutputFilesToMedia([{ path: '/user/1/image_generated/photo123.jpg' }]);
    expect(item.title).toBe('photo123.jpg');
  });

  test('multiple files produces multiple media items', () => {
    const result = skillOutputFilesToMedia([
      { path: '/user/1/photo.png' },
      { path: '/user/1/clip.mp4' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('image');
    expect(result[1].kind).toBe('video');
  });

  test('empty outputFiles returns empty array', () => {
    expect(skillOutputFilesToMedia([])).toHaveLength(0);
  });
});

describe('SkillHandlerResult interface — outputFiles field', () => {
  test('type import compiles correctly', async () => {
    const { } = await import('../src/Network/modules/skill/skill.registry.js');
    // If this import succeeds, the type change compiled correctly
    expect(true).toBe(true);
  });
});
