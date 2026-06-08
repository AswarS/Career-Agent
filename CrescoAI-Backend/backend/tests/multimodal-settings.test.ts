/**
 * multimodal-settings.test.ts
 *
 * Tests for multimodal settings field parsing logic.
 * Pure unit tests — no DB required.
 *
 * Run:
 *   cd backend && bun test ./tests/multimodal-settings.test.ts
 */

import { describe, test, expect } from 'bun:test';
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';

// Mirror parseModels logic from SettingsService
function parseModels(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

describe('parseModels', () => {
  test('valid JSON array', () => {
    const result = parseModels('["modelA","modelB","modelC"]');
    expect(result).toEqual(['modelA', 'modelB', 'modelC']);
  });

  test('comma-separated string fallback', () => {
    const result = parseModels('modelA, modelB, modelC');
    expect(result).toEqual(['modelA', 'modelB', 'modelC']);
  });

  test('single model', () => {
    expect(parseModels('dall-e-3')).toEqual(['dall-e-3']);
  });

  test('empty string returns empty array', () => {
    expect(parseModels('')).toEqual([]);
  });

  test('trims whitespace in comma-separated', () => {
    expect(parseModels('  model1  ,  model2  ')).toEqual(['model1', 'model2']);
  });

  test('filters empty entries', () => {
    expect(parseModels('model1,,model2')).toEqual(['model1', 'model2']);
  });
});

describe('UpdateApiSettingsDto multimodal fields', () => {
  test('DTO declares snake_case multimodal fields', async () => {
    const source = await readFile(
      new URL('../src/Network/modules/settings/dto/update-api-settings.dto.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('image_url?: string;');
    expect(source).toContain('image_key?: string;');
    expect(source).toContain('image_default_model?: string;');
    expect(source).toContain('image_models?: string;');
    expect(source).toContain('video_url?: string;');
    expect(source).toContain('video_key?: string;');
    expect(source).toContain('video_default_model?: string;');
    expect(source).toContain('video_models?: string;');
  });

  test('camelCase aliases are present', async () => {
    const source = await readFile(
      new URL('../src/Network/modules/settings/dto/update-api-settings.dto.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('imageUrl?: string;');
    expect(source).toContain('imageKey?: string;');
    expect(source).toContain('imageDefaultModel?: string;');
    expect(source).toContain('imageModels?: string;');
    expect(source).toContain('videoUrl?: string;');
    expect(source).toContain('videoKey?: string;');
    expect(source).toContain('videoDefaultModel?: string;');
    expect(source).toContain('videoModels?: string;');
  });
});

describe('ApiSettingsEntity multimodal columns', () => {
  test('entity declares multimodal columns', async () => {
    const source = await readFile(
      new URL('../src/Network/modules/settings/entities/api-settings.entity.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('imageUrl?: string;');
    expect(source).toContain('imageKey?: string;');
    expect(source).toContain('imageDefaultModel?: string;');
    expect(source).toContain('imageModels?: string;');
    expect(source).toContain('videoUrl?: string;');
    expect(source).toContain('videoKey?: string;');
    expect(source).toContain('videoDefaultModel?: string;');
    expect(source).toContain('videoModels?: string;');
  });
});
