import { describe, expect, test } from 'bun:test';
import type { DataSource, EntityManager } from 'typeorm';
import { BaseProfileEntity } from '../src/Network/modules/profile/entities/base-profile.entity.js';
import { ProfileMemoryItemEntity } from '../src/Network/modules/profile/entities/profile-memory-item.entity.js';
import { ProfileRevisionEntity } from '../src/Network/modules/profile/entities/profile-revision.entity.js';
import { ProfileStateEntity } from '../src/Network/modules/profile/entities/profile-state.entity.js';
import { ProfileExternalSnapshotService } from '../src/Network/modules/profile/profile-external-snapshot.service.js';
import type { ProfileV2Service } from '../src/Network/modules/profile/profile-v2.service.js';
import { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';

const updatedAt = new Date('2026-07-27T10:00:00.000Z');

function memory(
  profileIndex: string | null,
  content: string,
  overrides: Partial<ProfileMemoryItemEntity> = {},
) {
  return {
    id: `internal-${content}`,
    userId: 41,
    profileIndex,
    profileLevel: 'L2',
    itemVersion: 1,
    content,
    normalizedKey: content.toLowerCase(),
    category: 'goal',
    slotKey: `legacy.intentConstraints.${content}`,
    appliesToJson: '["job","career"]',
    timeScope: 'long_term',
    priority: 'high',
    sourceType: 'user_explicit',
    sourceConversationId: 'internal-conversation',
    sourceMessageId: 'internal-message',
    status: 'active',
    expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    supersedesId: null,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt,
    ...overrides,
  } as ProfileMemoryItemEntity;
}

function createService(memories: ProfileMemoryItemEntity[]) {
  const user = {
    id: 41,
    publicUserId: '09082ba6-20b3-46e1-9b53-33f1ed7d0257',
  } as UserEntity;
  const base = {
    id: 9,
    userId: 41,
    name: 'Snapshot User',
    gender: '',
    birthDate: '1998-02-10',
    educationLevel: '本科',
    educationBackgroundJson: JSON.stringify([{
      school: 'Example University',
      major: 'Computer Science',
      degree: 'BSc',
      graduationDate: '2020-06-30',
      description: '',
    }]),
    currentCity: 'Shanghai',
    currentStatus: 'employed',
    currentRole: 'Engineer',
    currentIndustry: 'Software',
    yearsOfExperience: 6,
    contactLanguage: 'zh-CN',
    version: 3,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt,
  } as BaseProfileEntity;
  const state = {
    id: 4,
    userId: 41,
    aggregateVersion: 12,
    projectionVersion: 12,
    projectionStatus: 'current',
    nextProfileIndex: 3,
    updatedAt,
  } as ProfileStateEntity;
  const manager = {
    findOne: async (entity: unknown) => {
      if (entity === UserEntity) return user;
      if (entity === BaseProfileEntity) return base;
      if (entity === ProfileStateEntity) return state;
      if (entity === ProfileRevisionEntity) {
        return { createdAt: updatedAt } as ProfileRevisionEntity;
      }
      return null;
    },
    find: async (entity: unknown) =>
      entity === ProfileMemoryItemEntity ? memories : [],
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      callback: (transactionManager: EntityManager) => unknown,
    ) => callback(manager),
  } as unknown as DataSource;
  const profileV2Service = {
    getState: async () => state,
  } as unknown as ProfileV2Service;
  return new ProfileExternalSnapshotService(dataSource, profileV2Service);
}

describe('Profile V2 external snapshot', () => {
  test('is deterministic, complete, and excludes internal identifiers', async () => {
    const first = memory('P000001', 'Target role');
    const second = memory('P000002', 'Career constraint');
    const snapshotA = await createService([second, first]).getCurrentSnapshot(41);
    const snapshotB = await createService([first, second]).getCurrentSnapshot(41);

    expect(snapshotA).toEqual(snapshotB);
    expect(snapshotA.profileVersion).toBe('12');
    expect(snapshotA.schemaVersion).toBe('career_profile_v2');
    expect(snapshotA.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshotA.profile.memories.map(({ profileIndex }) => profileIndex))
      .toEqual(['P000001', 'P000002']);
    // Expiration is a persisted lifecycle transition. The snapshot must not
    // silently change merely because wall-clock time advanced.
    expect(snapshotA.profile.memories[0].expiresAt)
      .toBe('2020-01-01T00:00:00.000Z');
    const serialized = JSON.stringify(snapshotA);
    expect(serialized).not.toContain('"userId"');
    expect(serialized).not.toContain('internal-conversation');
    expect(serialized).not.toContain('internal-message');
    expect(serialized).not.toContain('internal-Target role');
    expect(serialized).not.toContain('"age"');
  });

  test('rejects an active memory without a public profile index', async () => {
    await expect(
      createService([memory(null, 'Invalid')]).getCurrentSnapshot(41),
    ).rejects.toMatchObject({
      response: {
        code: 'PROFILE_SNAPSHOT_INVALID_MEMORY_INDEX',
      },
    });
  });
});
