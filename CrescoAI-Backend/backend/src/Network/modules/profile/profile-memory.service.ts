import { randomUUID, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, LessThanOrEqual, Not, Repository } from 'typeorm';
import {
  CreateProfileMemoryDto,
  QueryProfileMemoryDto,
  UpdateProfileMemoryDto,
} from './dto/profile-memory.dto';
import { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import { ProfileProjectionJobEntity } from './entities/profile-projection-job.entity';
import { ProfileRevisionEntity } from './entities/profile-revision.entity';
import { ProfileStateEntity } from './entities/profile-state.entity';
import { profileAccessDenied, profileResourceNotFound, profileValidationError, profileVersionConflict } from './profile.errors';
import { profileFeatureFlags } from './profile-feature-flags';
import { ProfileProjectionService } from './profile-projection.service';
import type { ProfileMemoryRecord, ProfileMutationMeta } from './profile-v2.types';
import type { ProfileMemoryCandidate } from './profile-v2.types';
import { ProfileV2Service } from './profile-v2.service';
import { containsSensitiveProfileData } from './profile-policy.service';

@Injectable()
export class ProfileMemoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProfileMemoryItemEntity)
    private readonly memoryRepo: Repository<ProfileMemoryItemEntity>,
    @InjectRepository(ProfileStateEntity)
    private readonly stateRepo: Repository<ProfileStateEntity>,
    @InjectRepository(ProfileRevisionEntity)
    private readonly revisionRepo: Repository<ProfileRevisionEntity>,
    private readonly projectionService: ProfileProjectionService,
    private readonly baseService: ProfileV2Service,
  ) {}

  async list(userId: number, query: QueryProfileMemoryDto = {}) {
    const where: FindOptionsWhere<ProfileMemoryItemEntity> = {
      userId,
      status: query.status ?? 'active',
    };
    if (query.timeScope) where.timeScope = query.timeScope;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;
    const entities = await this.memoryRepo.find({
      where,
      order: { updatedAt: 'DESC' },
      take: query.limit ?? 100,
    });
    const now = Date.now();
    return entities
      .filter((entity) =>
        entity.status !== 'active'
        || !entity.expiresAt
        || entity.expiresAt.getTime() > now)
      .map((entity) => this.projectionService.toRecord(entity));
  }

  async listAllForProjection(userId: number) {
    const entities = await this.memoryRepo.find({ where: { userId } });
    return entities.map((entity) => this.projectionService.toRecord(entity));
  }

  async findActiveEntities(userId: number) {
    const rows = await this.memoryRepo.find({ where: { userId, status: 'active' } });
    const now = Date.now();
    return rows.filter((item) => !item.expiresAt || item.expiresAt.getTime() > now);
  }

  toRecord(entity: ProfileMemoryItemEntity) {
    return this.projectionService.toRecord(entity);
  }

  async applyCandidate(
    userId: number,
    candidate: ProfileMemoryCandidate,
    conflictIds: string[],
    meta: ProfileMutationMeta,
  ) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    await this.baseService.getState(userId);
    const expectedVersion = await this.getAggregateVersion(userId);
    const content = this.normalizeContent(candidate.content);
    if (containsSensitiveProfileData(content)) {
      throw profileValidationError('sensitive data cannot be stored in Profile Memory');
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.requireVersion(manager, userId, expectedVersion);
      const conflicts = conflictIds.length
        ? await manager.find(ProfileMemoryItemEntity, {
            where: conflictIds.map((id) => ({ id, userId, status: 'active' as const })),
          })
        : [];
      const before = conflicts.map((item) => this.projectionService.toRecord(item));
      for (const conflict of conflicts) {
        conflict.status = 'superseded';
        conflict.version += 1;
        await manager.save(conflict);
      }
      const entity = manager.create(ProfileMemoryItemEntity, {
        id: randomUUID(),
        userId,
        content,
        normalizedKey: this.normalizedKey(content, candidate.category),
        category: candidate.category.trim().toLowerCase(),
        slotKey: candidate.slotKey?.trim().toLowerCase() ?? '',
        appliesToJson: JSON.stringify(this.normalizeList(candidate.appliesTo ?? [])),
        timeScope: candidate.timeScope === 'long_term' ? 'long_term' : 'short_term',
        priority: candidate.priority ?? 'normal',
        sourceType: candidate.sourceType ?? meta.sourceType,
        sourceConversationId: candidate.sourceConversationId ?? meta.sourceConversationId ?? null,
        sourceMessageId: candidate.sourceMessageId ?? meta.sourceMessageId ?? null,
        status: 'active',
        expiresAt: candidate.expiresAt ? new Date(candidate.expiresAt) : null,
        supersedesId: conflicts[0]?.id ?? null,
        version: 1,
      });
      const saved = await manager.save(entity);
      state.aggregateVersion += 1;
      state.projectionStatus = 'pending';
      await manager.save(state);
      const after = this.projectionService.toRecord(saved);
      await manager.save(manager.create(ProfileRevisionEntity, {
        userId,
        aggregateVersion: state.aggregateVersion,
        targetType: 'memory',
        targetId: saved.id,
        operation: conflicts.length ? 'supersede' : 'create',
        beforeJson: before.length ? JSON.stringify(before) : null,
        afterJson: JSON.stringify(after),
        sourceType: meta.sourceType,
        updateLevel: meta.updateLevel ?? 'L2',
        sourceConversationId: meta.sourceConversationId ?? null,
        sourceMessageId: meta.sourceMessageId ?? null,
        userConfirmed: meta.userConfirmed ?? false,
        actorType: meta.actorType ?? 'agent',
      }));
      await manager.save(manager.create(ProfileProjectionJobEntity, {
        userId,
        targetVersion: state.aggregateVersion,
        status: 'pending',
        retryCount: 0,
        lastError: null,
      }));
      return after;
    });
    await this.projectionService.projectUser(userId);
    return result;
  }

  async create(
    userId: number,
    input: CreateProfileMemoryDto,
    meta: ProfileMutationMeta,
  ): Promise<ProfileMemoryRecord> {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    await this.baseService.getState(userId);
    const content = this.normalizeContent(input.content);
    if (!content) throw profileValidationError('memory content is required');
    if (containsSensitiveProfileData(content)) {
      throw profileValidationError('sensitive data cannot be stored in Profile Memory');
    }
    const normalizedKey = this.normalizedKey(content, input.category);
    const duplicate = await this.memoryRepo.findOne({
      where: { userId, normalizedKey, status: 'active' },
    });
    if (duplicate) return this.projectionService.toRecord(duplicate);

    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.requireVersion(manager, userId, input.expectedVersion);
      const normalizedSlot = input.slotKey?.trim().toLowerCase() ?? '';
      const conflicts = normalizedSlot
        ? await manager.find(ProfileMemoryItemEntity, {
            where: { userId, slotKey: normalizedSlot, status: 'active' },
          })
        : [];
      for (const conflict of conflicts) {
        conflict.status = 'superseded';
        conflict.version += 1;
        await manager.save(conflict);
      }
      const entity = manager.create(ProfileMemoryItemEntity, {
        id: randomUUID(),
        userId,
        content,
        normalizedKey,
        category: input.category.trim().toLowerCase(),
        slotKey: normalizedSlot,
        appliesToJson: JSON.stringify(this.normalizeList(input.appliesTo ?? [])),
        timeScope: input.timeScope,
        priority: input.priority,
        sourceType: meta.sourceType,
        sourceConversationId: meta.sourceConversationId ?? null,
        sourceMessageId: meta.sourceMessageId ?? null,
        status: 'active',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        supersedesId: conflicts[0]?.id ?? null,
        version: 1,
      });
      const saved = await manager.save(entity);
      await this.recordMutation(
        manager,
        state,
        saved,
        conflicts[0] ? this.projectionService.toRecord(conflicts[0]) : null,
        conflicts.length ? 'supersede' : 'create',
        meta,
      );
      return this.projectionService.toRecord(saved);
    });
    await this.projectionService.projectUser(userId);
    return result;
  }

  async update(
    userId: number,
    id: string,
    input: UpdateProfileMemoryDto,
    meta: ProfileMutationMeta,
  ) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    const result = await this.dataSource.transaction(async (manager) => {
      const state = await this.requireVersion(manager, userId, input.expectedVersion);
      const entity = await manager.findOne(ProfileMemoryItemEntity, { where: { id, userId } });
      if (!entity) throw profileResourceNotFound('profile memory', id);
      const before = this.projectionService.toRecord(entity);
      if (input.content !== undefined) {
        entity.content = this.normalizeContent(input.content);
        if (containsSensitiveProfileData(entity.content)) {
          throw profileValidationError('sensitive data cannot be stored in Profile Memory');
        }
        entity.normalizedKey = this.normalizedKey(
          entity.content,
          input.category ?? entity.category,
        );
      }
      if (input.category !== undefined) {
        entity.category = input.category.trim().toLowerCase();
        entity.normalizedKey = this.normalizedKey(entity.content, entity.category);
      }
      if (input.slotKey !== undefined) entity.slotKey = input.slotKey.trim().toLowerCase();
      if (input.appliesTo !== undefined) {
        entity.appliesToJson = JSON.stringify(this.normalizeList(input.appliesTo));
      }
      if (input.timeScope !== undefined) entity.timeScope = input.timeScope;
      if (input.priority !== undefined) entity.priority = input.priority;
      if (input.status !== undefined) entity.status = input.status;
      if (input.expiresAt !== undefined) {
        entity.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      if (entity.status === 'active') {
        const duplicate = await manager.findOne(ProfileMemoryItemEntity, {
          where: { userId, normalizedKey: entity.normalizedKey, status: 'active', id: Not(id) },
        });
        if (duplicate) {
          throw profileValidationError('an equivalent active Profile Memory already exists');
        }
        if (entity.slotKey) {
          const conflicts = await manager.find(ProfileMemoryItemEntity, {
            where: { userId, slotKey: entity.slotKey, status: 'active', id: Not(id) },
          });
          for (const conflict of conflicts) {
            conflict.status = 'superseded';
            conflict.version += 1;
            await manager.save(conflict);
          }
        }
      }
      entity.version += 1;
      const saved = await manager.save(entity);
      await this.recordMutation(manager, state, saved, before, 'update', meta);
      return this.projectionService.toRecord(saved);
    });
    await this.projectionService.projectUser(userId);
    return result;
  }

  async softDelete(userId: number, id: string, expectedVersion: number) {
    return this.update(userId, id, { expectedVersion, status: 'deleted' }, {
      sourceType: 'user_ui',
      actorType: 'user',
      userConfirmed: true,
      updateLevel: 'L3',
    });
  }

  async history(userId: number, limit = 100) {
    const rows = await this.revisionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row) => ({
      id: row.id,
      aggregateVersion: row.aggregateVersion,
      targetType: row.targetType,
      targetId: row.targetId,
      operation: row.operation,
      sourceType: row.sourceType,
      updateLevel: row.updateLevel,
      sourceConversationId: row.sourceConversationId,
      userConfirmed: row.userConfirmed,
      actorType: row.actorType,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getAggregateVersion(userId: number) {
    const state = await this.stateRepo.findOne({ where: { userId } });
    return state?.aggregateVersion ?? 1;
  }

  async expireDueMemories(limit = 100) {
    const due = await this.memoryRepo.find({
      where: { status: 'active', expiresAt: LessThanOrEqual(new Date()) },
      order: { expiresAt: 'ASC' },
      take: limit,
    });
    for (const item of due) {
      const expectedVersion = await this.getAggregateVersion(item.userId);
      await this.update(item.userId, item.id, {
        expectedVersion,
        status: 'expired',
      }, {
        sourceType: 'system_correction',
        actorType: 'system',
        userConfirmed: false,
        updateLevel: 'L1',
      });
    }
    return due.length;
  }

  private async requireVersion(manager: DataSource['manager'], userId: number, expected: number) {
    const state = await manager.findOne(ProfileStateEntity, { where: { userId } });
    if (!state) throw profileValidationError('profile state is not initialized');
    if (state.aggregateVersion !== expected) {
      throw profileVersionConflict(expected, state.aggregateVersion);
    }
    return state;
  }

  private async recordMutation(
    manager: DataSource['manager'],
    state: ProfileStateEntity,
    afterEntity: ProfileMemoryItemEntity,
    before: ProfileMemoryRecord | null,
    operation: string,
    meta: ProfileMutationMeta,
  ) {
    state.aggregateVersion += 1;
    state.projectionStatus = 'pending';
    await manager.save(state);
    const after = this.projectionService.toRecord(afterEntity);
    await manager.save(manager.create(ProfileRevisionEntity, {
      userId: afterEntity.userId,
      aggregateVersion: state.aggregateVersion,
      targetType: 'memory',
      targetId: afterEntity.id,
      operation,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: JSON.stringify(after),
      sourceType: meta.sourceType,
      updateLevel: meta.updateLevel ?? 'L3',
      sourceConversationId: meta.sourceConversationId ?? null,
      sourceMessageId: meta.sourceMessageId ?? null,
      userConfirmed: meta.userConfirmed ?? meta.actorType === 'user',
      actorType: meta.actorType ?? 'user',
    }));
    await manager.save(manager.create(ProfileProjectionJobEntity, {
      userId: afterEntity.userId,
      targetVersion: state.aggregateVersion,
      status: 'pending',
      retryCount: 0,
      lastError: null,
    }));
  }

  private normalizeContent(content: string) {
    return content.replace(/\s+/g, ' ').trim();
  }

  private normalizedKey(content: string, category: string) {
    return createHash('sha256')
      .update(`${category.trim().toLowerCase()}\n${content.toLowerCase()}`)
      .digest('hex');
  }

  private normalizeList(values: string[]) {
    return [...new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  }
}
