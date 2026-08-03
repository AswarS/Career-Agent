import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { BaseProfileEntity } from './entities/base-profile.entity';
import { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import { ProfileRevisionEntity } from './entities/profile-revision.entity';
import { ProfileStateEntity } from './entities/profile-state.entity';
import {
  hashCanonicalProfile,
  serializeCanonicalProfile,
} from './profile-version.utils';
import { PROFILE_V2_SCHEMA_VERSION } from './profile-v2.types';
import { ProfileV2Service } from './profile-v2.service';

export interface ExternalBaseProfile {
  name: string;
  gender: string;
  birthDate: string | null;
  educationLevel: string;
  educationBackground: Array<{
    school: string;
    major: string;
    degree: string;
    graduationDate: string | null;
    description: string;
  }>;
  currentCity: string;
  currentStatus: string;
  currentRole: string;
  currentIndustry: string;
  yearsOfExperience: number | null;
  contactLanguage: string;
}

export interface ExternalProfileMemory {
  profileIndex: string;
  profileLevel: 'L1' | 'L2' | 'L3';
  itemVersion: number;
  content: string;
  category: string;
  slotKey: string;
  appliesTo: string[];
  timeScope: 'long_term' | 'short_term';
  priority: 'hard_constraint' | 'high' | 'normal' | 'background';
  expiresAt: string | null;
}

export interface ExternalProfileSnapshot {
  externalUserId: string;
  profileVersion: string;
  schemaVersion: typeof PROFILE_V2_SCHEMA_VERSION;
  updatedAt: string;
  profile: {
    base: ExternalBaseProfile;
    memories: ExternalProfileMemory[];
  };
  contentHash: string;
}

@Injectable()
export class ProfileExternalSnapshotService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly profileV2Service: ProfileV2Service,
  ) {}

  async getCurrentSnapshot(userId: number): Promise<ExternalProfileSnapshot> {
    // Profile V2 lazily initializes legacy users. Initialization happens before
    // the read transaction so the transaction itself remains read-only.
    await this.profileV2Service.getState(userId);

    return this.dataSource.transaction((manager) =>
      this.readConsistentSnapshot(manager, userId));
  }

  private async readConsistentSnapshot(
    manager: EntityManager,
    userId: number,
  ): Promise<ExternalProfileSnapshot> {
    const stateBefore = await manager.findOne(ProfileStateEntity, {
      where: { userId },
    });
    const [user, base, memories, revision] = await Promise.all([
      manager.findOne(UserEntity, { where: { id: userId } }),
      manager.findOne(BaseProfileEntity, { where: { userId } }),
      manager.find(ProfileMemoryItemEntity, {
        where: { userId, status: 'active' },
      }),
      manager.findOne(ProfileRevisionEntity, {
        where: {
          userId,
          aggregateVersion: stateBefore?.aggregateVersion,
        },
        order: { id: 'DESC' },
      }),
    ]);
    const stateAfter = await manager.findOne(ProfileStateEntity, {
      where: { userId },
    });

    if (!user || !base || !stateBefore || !stateAfter) {
      throw new NotFoundException('Profile V2 state was not found');
    }
    if (stateBefore.aggregateVersion !== stateAfter.aggregateVersion) {
      throw new InternalServerErrorException({
        code: 'PROFILE_SNAPSHOT_CONCURRENT_CHANGE',
        message: 'profile changed while the external snapshot was generated',
      });
    }

    const profile = {
      base: this.toExternalBase(base),
      memories: memories
        .map((memory) => this.toExternalMemory(memory))
        .sort((left, right) =>
          left.profileIndex.localeCompare(right.profileIndex)
          || left.itemVersion - right.itemVersion),
    };
    const profileJson = serializeCanonicalProfile(profile);

    return {
      externalUserId: user.publicUserId,
      profileVersion: String(stateAfter.aggregateVersion),
      schemaVersion: PROFILE_V2_SCHEMA_VERSION,
      updatedAt: (revision?.createdAt ?? stateAfter.updatedAt).toISOString(),
      profile,
      contentHash: hashCanonicalProfile(profileJson),
    };
  }

  private toExternalBase(entity: BaseProfileEntity): ExternalBaseProfile {
    return {
      name: entity.name,
      gender: entity.gender,
      birthDate: entity.birthDate,
      educationLevel: entity.educationLevel,
      educationBackground: this.parseEducation(entity.educationBackgroundJson),
      currentCity: entity.currentCity,
      currentStatus: entity.currentStatus,
      currentRole: entity.currentRole,
      currentIndustry: entity.currentIndustry,
      yearsOfExperience: entity.yearsOfExperience,
      contactLanguage: entity.contactLanguage,
    };
  }

  private toExternalMemory(
    entity: ProfileMemoryItemEntity,
  ): ExternalProfileMemory {
    if (!entity.profileIndex) {
      throw new InternalServerErrorException({
        code: 'PROFILE_SNAPSHOT_INVALID_MEMORY_INDEX',
        message: 'active profile memory is missing its public profile index',
      });
    }
    return {
      profileIndex: entity.profileIndex,
      profileLevel: entity.profileLevel ?? 'L2',
      itemVersion: entity.itemVersion ?? 1,
      content: entity.content,
      category: entity.category,
      slotKey: entity.slotKey,
      appliesTo: this.parseStringList(entity.appliesToJson).sort(),
      timeScope: entity.timeScope,
      priority: entity.priority,
      expiresAt: entity.expiresAt?.toISOString() ?? null,
    };
  }

  private parseEducation(raw: string): ExternalBaseProfile['educationBackground'] {
    try {
      const value = JSON.parse(raw) as unknown;
      if (!Array.isArray(value)) {
        return [];
      }
      return value
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null && !Array.isArray(item),
        )
        .map((item) => ({
          school: this.text(item.school),
          major: this.text(item.major),
          degree: this.text(item.degree),
          graduationDate:
            typeof item.graduationDate === 'string'
              ? item.graduationDate
              : null,
          description: this.text(item.description),
        }))
        .sort((left, right) =>
          left.school.localeCompare(right.school)
          || left.major.localeCompare(right.major)
          || (left.graduationDate ?? '').localeCompare(
            right.graduationDate ?? '',
          ));
    } catch {
      return [];
    }
  }

  private parseStringList(raw: string) {
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value)
        ? [...new Set(
            value
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean),
          )]
        : [];
    } catch {
      return [];
    }
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }
}
