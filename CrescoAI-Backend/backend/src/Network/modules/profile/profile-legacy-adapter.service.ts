import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { applyPublicAccountPatch } from '../integration/account-publication';
import { BaseProfileEntity } from './entities/base-profile.entity';
import { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import { ProfileProjectionJobEntity } from './entities/profile-projection-job.entity';
import { ProfileRevisionEntity } from './entities/profile-revision.entity';
import { ProfileStateEntity } from './entities/profile-state.entity';
import { ProfileSuggestionEntity } from './entities/profile-suggestion.entity';
import { ProfileProjectionService } from './profile-projection.service';
import { serializeCanonicalProfile } from './profile-version.utils';
import { ProfileV2Service } from './profile-v2.service';
import type { ProfileRecord } from './profile.types';
import { formatProfileIndex } from './profile-index.utils';

interface LegacyMemoryValue {
  slotKey: string;
  content: string;
  category: string;
  appliesTo: string[];
  timeScope: 'long_term' | 'short_term';
  priority: 'high' | 'normal' | 'background';
}

const BASE_LEGACY_KEYS = new Set([
  'basicInfo.fullName',
  'basicInfo.displayName',
  'basicInfo.currentCity',
  'careerProfile.currentRole',
  'careerProfile.employmentStatus',
  'careerProfile.educationBackground',
]);

@Injectable()
export class ProfileLegacyAdapterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly profileV2Service: ProfileV2Service,
    private readonly projectionService: ProfileProjectionService,
  ) {}

  async apply(
    userId: number,
    profile: ProfileRecord,
    suggestionRowId?: number,
  ) {
    // Ensure lazy-created V2 rows exist before entering the authoritative write
    // transaction. All subsequent business changes share one aggregate version.
    await this.profileV2Service.getState(userId);

    const changed = await this.dataSource.transaction(async (manager) => {
      const [user, base, state] = await Promise.all([
        manager.findOne(UserEntity, { where: { id: userId } }),
        manager.findOne(BaseProfileEntity, { where: { userId } }),
        manager.findOne(ProfileStateEntity, { where: { userId } }),
      ]);
      if (!user || !base || !state) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'user profile was not found',
        });
      }

      const suggestion = suggestionRowId
        ? await manager.findOne(ProfileSuggestionEntity, {
            where: { rowId: suggestionRowId, userId, status: 'pending' },
          })
        : null;
      if (suggestionRowId && !suggestion) {
        throw new NotFoundException({
          code: 'PROFILE_SUGGESTION_NOT_FOUND',
          message: 'pending profile suggestion not found',
        });
      }

      const nextAggregateVersion = state.aggregateVersion + 1;
      const revisions: ProfileRevisionEntity[] = [];
      let businessChanged = await this.updateBase(
        manager,
        base,
        profile,
        nextAggregateVersion,
        revisions,
      );
      businessChanged = (await this.syncMemories(
        manager,
        userId,
        profile,
        state,
        nextAggregateVersion,
        revisions,
      )) || businessChanged;

      const profileJson = serializeCanonicalProfile(profile);
      const displayName =
        profile.basicInfo.fullName || profile.basicInfo.displayName;
      await applyPublicAccountPatch(manager, user, {
        displayName: displayName || user.displayName,
      });
      await manager.update(
        UserEntity,
        { id: user.id },
        { profileJson },
      );
      user.profileJson = profileJson;

      if (suggestion) {
        suggestion.status = 'accepted';
        suggestion.resolvedAt = new Date();
        await manager.save(suggestion);
      }

      if (!businessChanged) {
        return false;
      }

      const claimed = await manager.update(
        ProfileStateEntity,
        { id: state.id, aggregateVersion: state.aggregateVersion },
        {
          aggregateVersion: nextAggregateVersion,
          projectionStatus: 'pending',
          nextProfileIndex: state.nextProfileIndex,
        },
      );
      if (claimed.affected !== 1) {
        throw new ConflictException({
          code: 'PROFILE_VERSION_CONFLICT',
          message: 'profile changed concurrently; reload and retry',
        });
      }
      await manager.save(revisions);
      await manager.save(
        manager.create(ProfileProjectionJobEntity, {
          userId,
          targetVersion: nextAggregateVersion,
          status: 'pending',
          retryCount: 0,
          lastError: null,
        }),
      );
      return true;
    });

    if (changed) {
      await this.projectionService.projectUser(userId);
    }
    return profile;
  }

  private async updateBase(
    manager: EntityManager,
    base: BaseProfileEntity,
    profile: ProfileRecord,
    aggregateVersion: number,
    revisions: ProfileRevisionEntity[],
  ) {
    const before = this.baseSnapshot(base);
    const education = profile.careerProfile.educationBackground
      ? [{
          school: '',
          major: '',
          degree: '',
          graduationDate: null,
          description: profile.careerProfile.educationBackground,
        }]
      : [];
    base.name = profile.basicInfo.fullName || profile.basicInfo.displayName;
    base.currentCity = profile.basicInfo.currentCity;
    base.currentRole = profile.careerProfile.currentRole;
    base.currentStatus = profile.careerProfile.employmentStatus;
    base.educationBackgroundJson = JSON.stringify(education);
    const after = this.baseSnapshot(base);
    if (serializeCanonicalProfile(before) === serializeCanonicalProfile(after)) {
      return false;
    }

    base.version += 1;
    await manager.save(base);
    revisions.push(manager.create(ProfileRevisionEntity, {
      userId: base.userId,
      aggregateVersion,
      targetType: 'base_profile',
      targetId: String(base.id),
      operation: 'update',
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      sourceType: 'user_ui',
      updateLevel: 'L3',
      sourceConversationId: null,
      sourceMessageId: null,
      userConfirmed: true,
      actorType: 'user',
    }));
    return true;
  }

  private async syncMemories(
    manager: EntityManager,
    userId: number,
    profile: ProfileRecord,
    state: ProfileStateEntity,
    aggregateVersion: number,
    revisions: ProfileRevisionEntity[],
  ) {
    const desired = new Map(
      this.toManagedMemories(profile).map((item) => [item.slotKey, item]),
    );
    const existing = await manager.find(ProfileMemoryItemEntity, {
      where: { userId, status: 'active' },
    });
    const managed = existing.filter((item) =>
      item.slotKey.startsWith('legacy.'));
    let changed = false;

    for (const current of managed) {
      const next = desired.get(current.slotKey);
      desired.delete(current.slotKey);
      if (next && this.memoryMatches(current, next)) {
        continue;
      }

      current.status = next ? 'superseded' : 'deleted';
      current.version += 1;
      await manager.save(current);
      revisions.push(this.memoryRevision(
        manager,
        current,
        aggregateVersion,
        next ? 'supersede' : 'delete',
        this.memorySnapshot(current, 'active'),
        this.memorySnapshot(current),
      ));
      changed = true;
      if (next) {
        const profileIndex = current.profileIndex
          ?? formatProfileIndex(state.nextProfileIndex);
        if (!current.profileIndex) {
          state.nextProfileIndex += 1;
        }
        const replacement = this.createMemory(
          manager,
          userId,
          next,
          profileIndex,
          current.itemVersion + 1,
          current.id,
        );
        await manager.save(replacement);
        revisions.push(this.memoryRevision(
          manager,
          replacement,
          aggregateVersion,
          'create',
          null,
          this.memorySnapshot(replacement),
        ));
      }
    }

    for (const next of desired.values()) {
      const profileIndex = formatProfileIndex(state.nextProfileIndex);
      state.nextProfileIndex += 1;
      const created = this.createMemory(
        manager,
        userId,
        next,
        profileIndex,
        1,
        null,
      );
      await manager.save(created);
      revisions.push(this.memoryRevision(
        manager,
        created,
        aggregateVersion,
        'create',
        null,
        this.memorySnapshot(created),
      ));
      changed = true;
    }
    return changed;
  }

  private toManagedMemories(profile: ProfileRecord): LegacyMemoryValue[] {
    const sections = profile as unknown as Record<string, unknown>;
    const rows: LegacyMemoryValue[] = [];
    for (const [sectionName, sectionValue] of Object.entries(sections)) {
      if (
        sectionName === 'schemaVersion'
        || typeof sectionValue !== 'object'
        || sectionValue === null
        || Array.isArray(sectionValue)
      ) {
        continue;
      }
      for (const [fieldName, value] of Object.entries(
        sectionValue as Record<string, unknown>,
      )) {
        const legacyKey = `${sectionName}.${fieldName}`;
        if (BASE_LEGACY_KEYS.has(legacyKey)) {
          continue;
        }
        const content = Array.isArray(value)
          ? serializeCanonicalProfile(value)
          : typeof value === 'string'
            ? value.trim()
            : '';
        if (!content || content === '[]') {
          continue;
        }
        rows.push({
          slotKey: `legacy.${legacyKey}`,
          content,
          category: this.categoryFor(sectionName),
          appliesTo: this.appliesToFor(sectionName),
          timeScope:
            sectionName === 'activityRecords' || sectionName === 'planState'
              ? 'short_term'
              : 'long_term',
          priority: sectionName === 'intentConstraints' ? 'high' : 'normal',
        });
      }
    }
    return rows.sort((left, right) =>
      left.slotKey.localeCompare(right.slotKey));
  }

  private createMemory(
    manager: EntityManager,
    userId: number,
    value: LegacyMemoryValue,
    profileIndex: string,
    itemVersion: number,
    supersedesId: string | null,
  ) {
    return manager.create(ProfileMemoryItemEntity, {
      id: randomUUID(),
      userId,
      profileIndex,
      profileLevel: 'L3',
      itemVersion,
      content: value.content,
      normalizedKey: `${value.slotKey}:${value.content.toLowerCase()}`,
      category: value.category,
      slotKey: value.slotKey,
      appliesToJson: JSON.stringify(value.appliesTo),
      timeScope: value.timeScope,
      priority: value.priority,
      sourceType: 'user_explicit',
      sourceConversationId: null,
      sourceMessageId: null,
      status: 'active',
      expiresAt: null,
      supersedesId,
      version: 1,
    });
  }

  private memoryMatches(
    entity: ProfileMemoryItemEntity,
    value: LegacyMemoryValue,
  ) {
    return entity.content === value.content
      && entity.category === value.category
      && entity.appliesToJson === JSON.stringify(value.appliesTo)
      && entity.timeScope === value.timeScope
      && entity.priority === value.priority;
  }

  private memoryRevision(
    manager: EntityManager,
    memory: ProfileMemoryItemEntity,
    aggregateVersion: number,
    operation: string,
    before: unknown,
    after: unknown,
  ) {
    return manager.create(ProfileRevisionEntity, {
      userId: memory.userId,
      aggregateVersion,
      targetType: 'memory_item',
      targetId: memory.id,
      operation,
      beforeJson: before === null ? null : JSON.stringify(before),
      afterJson: after === null ? null : JSON.stringify(after),
      sourceType: 'user_ui',
      updateLevel: 'L3',
      sourceConversationId: null,
      sourceMessageId: null,
      userConfirmed: true,
      actorType: 'user',
    });
  }

  private baseSnapshot(base: BaseProfileEntity) {
    return {
      name: base.name,
      currentCity: base.currentCity,
      currentRole: base.currentRole,
      currentStatus: base.currentStatus,
      educationBackgroundJson: base.educationBackgroundJson,
    };
  }

  private memorySnapshot(
    memory: ProfileMemoryItemEntity,
    status = memory.status,
  ) {
    return {
      profileIndex: memory.profileIndex,
      profileLevel: memory.profileLevel,
      itemVersion: memory.itemVersion,
      content: memory.content,
      category: memory.category,
      slotKey: memory.slotKey,
      appliesTo: JSON.parse(memory.appliesToJson) as unknown,
      timeScope: memory.timeScope,
      priority: memory.priority,
      status,
      expiresAt: memory.expiresAt?.toISOString() ?? null,
    };
  }

  private categoryFor(section: string) {
    const categories: Record<string, string> = {
      basicInfo: 'identity',
      careerProfile: 'career',
      intentConstraints: 'goal',
      activityRecords: 'activity',
      artifacts: 'artifact',
      feedbackSignals: 'feedback',
      planState: 'plan',
      chinaResumeSupplement: 'resume',
    };
    return categories[section] ?? 'profile';
  }

  private appliesToFor(section: string) {
    const scopes: Record<string, string[]> = {
      basicInfo: ['profile'],
      careerProfile: ['career', 'job', 'resume', 'interview'],
      intentConstraints: ['career', 'job'],
      activityRecords: ['career', 'learning'],
      artifacts: ['resume', 'portfolio'],
      feedbackSignals: ['career', 'interview'],
      planState: ['career', 'learning', 'job'],
      chinaResumeSupplement: ['resume'],
    };
    return scopes[section] ?? ['profile'];
  }
}
