import { afterEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BaseProfileEntity } from '../src/Network/modules/profile/entities/base-profile.entity.js';
import { ProfileMemoryItemEntity } from '../src/Network/modules/profile/entities/profile-memory-item.entity.js';
import { ProfileProjectionJobEntity } from '../src/Network/modules/profile/entities/profile-projection-job.entity.js';
import { ProfileRevisionEntity } from '../src/Network/modules/profile/entities/profile-revision.entity.js';
import { ProfileStateEntity } from '../src/Network/modules/profile/entities/profile-state.entity.js';
import { ProfileSuggestionEntity } from '../src/Network/modules/profile/entities/profile-suggestion.entity.js';
import { ProfileExternalSnapshotService } from '../src/Network/modules/profile/profile-external-snapshot.service.js';
import { ProfileLegacyAdapterService } from '../src/Network/modules/profile/profile-legacy-adapter.service.js';
import type { ProfileProjectionService } from '../src/Network/modules/profile/profile-projection.service.js';
import { createDefaultProfile } from '../src/Network/modules/profile/profile.types.js';
import { ProfileV2Service } from '../src/Network/modules/profile/profile-v2.service.js';
import { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';

let dataSource: DataSource | undefined;

afterEach(async () => {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  dataSource = undefined;
});

describe('legacy profile writes converge on Profile V2', () => {
  test('updates base and memories with one aggregate version', async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [
        UserEntity,
        BaseProfileEntity,
        ProfileStateEntity,
        ProfileMemoryItemEntity,
        ProfileRevisionEntity,
        ProfileProjectionJobEntity,
        ProfileSuggestionEntity,
      ],
    });
    await dataSource.initialize();
    const userRepo = dataSource.getRepository(UserEntity);
    const user = await userRepo.save(userRepo.create({
      publicUserId: randomUUID(),
      displayName: 'Before',
      profileJson: JSON.stringify(createDefaultProfile('Before')),
      tokenVersion: 0,
      accountStatus: 'active',
      accountVersion: 1,
    }));
    const profileV2 = new ProfileV2Service(
      dataSource,
      userRepo,
      dataSource.getRepository(BaseProfileEntity),
      dataSource.getRepository(ProfileStateEntity),
    );
    const projection = {
      projectUser: async () => ({ status: 'current', version: 2 }),
    } as unknown as ProfileProjectionService;
    const adapter = new ProfileLegacyAdapterService(
      dataSource,
      profileV2,
      projection,
    );
    const snapshotService = new ProfileExternalSnapshotService(
      dataSource,
      profileV2,
    );
    const profile = createDefaultProfile('After');
    profile.basicInfo.currentCity = 'Shanghai';
    profile.careerProfile.currentRole = 'Product Manager';
    profile.intentConstraints.targetRole = 'AI Product Manager';
    profile.careerProfile.skills = ['Product strategy', 'AI'];

    await adapter.apply(user.id, profile);
    const snapshot = await snapshotService.getCurrentSnapshot(user.id);
    const state = await dataSource
      .getRepository(ProfileStateEntity)
      .findOneByOrFail({ userId: user.id });

    expect(state.aggregateVersion).toBe(2);
    expect(snapshot.profileVersion).toBe('2');
    expect(snapshot.profile.base).toMatchObject({
      name: 'After',
      currentCity: 'Shanghai',
      currentRole: 'Product Manager',
    });
    expect(snapshot.profile.memories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slotKey: 'legacy.intentConstraints.targetRole',
        content: 'AI Product Manager',
      }),
      expect.objectContaining({
        slotKey: 'legacy.careerProfile.skills',
        content: '["Product strategy","AI"]',
      }),
    ]));
  });
});
