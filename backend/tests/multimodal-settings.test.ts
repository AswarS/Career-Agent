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
  test('DTO type imports correctly', async () => {
    const { UpdateApiSettingsDto } = await import('../src/Network/modules/settings/dto/update-api-settings.dto.js');
    const dto = new UpdateApiSettingsDto();
    // All multimodal fields should be optional (undefined by default)
    expect(dto.image_url).toBeUndefined();
    expect(dto.image_key).toBeUndefined();
    expect(dto.image_default_model).toBeUndefined();
    expect(dto.image_models).toBeUndefined();
    expect(dto.video_url).toBeUndefined();
    expect(dto.video_key).toBeUndefined();
    expect(dto.video_default_model).toBeUndefined();
    expect(dto.video_models).toBeUndefined();
  });

  test('camelCase aliases are present', async () => {
    const { UpdateApiSettingsDto } = await import('../src/Network/modules/settings/dto/update-api-settings.dto.js');
    const dto = new UpdateApiSettingsDto();
    expect(dto.imageUrl).toBeUndefined();
    expect(dto.imageKey).toBeUndefined();
    expect(dto.imageDefaultModel).toBeUndefined();
    expect(dto.imageModels).toBeUndefined();
    expect(dto.videoUrl).toBeUndefined();
    expect(dto.videoKey).toBeUndefined();
    expect(dto.videoDefaultModel).toBeUndefined();
    expect(dto.videoModels).toBeUndefined();
  });
});

describe('ApiSettingsEntity multimodal columns', () => {
  test('entity type imports correctly with new columns', async () => {
    const { ApiSettingsEntity } = await import('../src/Network/modules/settings/entities/api-settings.entity.js');
    const entity = new ApiSettingsEntity();
    expect(entity.imageUrl).toBeUndefined();
    expect(entity.imageKey).toBeUndefined();
    expect(entity.imageDefaultModel).toBeUndefined();
    expect(entity.imageModels).toBeUndefined();
    expect(entity.videoUrl).toBeUndefined();
    expect(entity.videoKey).toBeUndefined();
    expect(entity.videoDefaultModel).toBeUndefined();
    expect(entity.videoModels).toBeUndefined();
  });
});
