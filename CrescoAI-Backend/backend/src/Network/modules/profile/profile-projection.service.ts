import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import { ProfileProjectionJobEntity } from './entities/profile-projection-job.entity';
import { ProfileStateEntity } from './entities/profile-state.entity';
import { ProfileMemoryFileStore } from './profile-memory-file.store';
import { renderMemoryIndex, renderProfileMarkdown } from './profile-memory.renderer';
import { ProfileV2Service } from './profile-v2.service';
import type { ProfileMemoryRecord } from './profile-v2.types';

@Injectable()
export class ProfileProjectionService {
  constructor(
    @InjectRepository(ProfileMemoryItemEntity)
    private readonly memoryRepo: Repository<ProfileMemoryItemEntity>,
    @InjectRepository(ProfileStateEntity)
    private readonly stateRepo: Repository<ProfileStateEntity>,
    @InjectRepository(ProfileProjectionJobEntity)
    private readonly jobRepo: Repository<ProfileProjectionJobEntity>,
    private readonly baseService: ProfileV2Service,
    private readonly fileStore: ProfileMemoryFileStore,
  ) {}

  async projectUser(userId: number, targetVersion?: number) {
    const state = await this.stateRepo.findOneOrFail({ where: { userId } });
    const version = Math.max(targetVersion ?? state.aggregateVersion, state.aggregateVersion);
    let job = await this.jobRepo.findOne({
      where: [
        { userId, targetVersion: version, status: 'pending' },
        { userId, targetVersion: version, status: 'failed' },
      ],
      order: { id: 'DESC' },
    });
    if (!job) {
      job = await this.jobRepo.save(this.jobRepo.create({
        userId,
        targetVersion: version,
        status: 'pending',
        retryCount: 0,
        lastError: null,
      }));
    }

    try {
      const [baseProfile, entities] = await Promise.all([
        this.baseService.getBaseProfile(userId),
        this.memoryRepo.find({ where: { userId }, order: { createdAt: 'ASC' } }),
      ]);
      const memories = entities.map((entity) => this.toRecord(entity));
      const generatedAt = new Date().toISOString();
      await this.fileStore.writeProjection(userId, {
        profile: renderProfileMarkdown({ baseProfile, memories, version, generatedAt }),
        index: renderMemoryIndex({ memories, version }),
      });
      job.status = 'completed';
      job.lastError = null;
      state.projectionVersion = version;
      state.projectionStatus = 'current';
      await this.jobRepo.update({
        userId,
        targetVersion: LessThanOrEqual(version),
        status: In(['pending', 'failed']),
      }, { status: 'completed', lastError: null });
      await this.stateRepo.save(state);
      return { status: 'current' as const, version };
    } catch (error) {
      job.status = 'failed';
      job.retryCount += 1;
      job.lastError = error instanceof Error ? error.message : String(error);
      state.projectionStatus = 'failed';
      await Promise.all([this.jobRepo.save(job), this.stateRepo.save(state)]);
      return { status: 'failed' as const, version, error: job.lastError };
    }
  }

  toRecord(entity: ProfileMemoryItemEntity): ProfileMemoryRecord {
    return {
      id: entity.id,
      content: entity.content,
      category: entity.category,
      slotKey: entity.slotKey,
      appliesTo: this.parseList(entity.appliesToJson),
      timeScope: entity.timeScope,
      priority: entity.priority,
      sourceType: entity.sourceType,
      sourceConversationId: entity.sourceConversationId,
      sourceMessageId: entity.sourceMessageId,
      status: entity.status,
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      supersedesId: entity.supersedesId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private parseList(raw: string) {
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
