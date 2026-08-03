import { describe, expect, it } from 'bun:test';
import {
  hashCanonicalProfile,
  serializeCanonicalProfile,
} from '../src/Network/modules/profile/profile-version.utils.js';

describe('RFC 8785 profile canonicalization', () => {
  it('produces the cross-platform fixed profile hash', () => {
    const canonical = serializeCanonicalProfile({
      learningGoals: ['完成结构化实训'],
      experienceSummary: '已有相关基础',
    });

    expect(canonical).toBe(
      '{"experienceSummary":"已有相关基础","learningGoals":["完成结构化实训"]}',
    );
    expect(hashCanonicalProfile(canonical)).toBe(
      'ec1282c3046e558051bc4430d05a5c67e7fc5d9b755a8c5acd6c828bc89fc605',
    );
  });

  it('rejects values outside I-JSON', () => {
    expect(() => serializeCanonicalProfile({ invalid: Number.NaN })).toThrow();
    expect(() => serializeCanonicalProfile({ invalid: undefined })).toThrow();
    expect(() => serializeCanonicalProfile('\ud800')).toThrow();
  });
});
