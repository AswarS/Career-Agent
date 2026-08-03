import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileSuggestionEntity } from './entities/profile-suggestion.entity';
import {
  createDefaultProfile,
  hasProfilePatchFields,
  hasProfileInputFields,
  normalizeProfilePatch,
  normalizeProfileRecord,
  type DeepPartial,
  type ProfileRecord,
  type ProfileSuggestion,
} from './profile.types';
import { profileFeatureFlags } from './profile-feature-flags';
import { ProfileExternalSnapshotService } from './profile-external-snapshot.service';
import { ProfileLegacyAdapterService } from './profile-legacy-adapter.service';

type UnknownRecord = Record<string, unknown>;

interface SaveSuggestionsFromOutputInput {
  userId: number;
  output: unknown;
  sourceThreadId?: string | null;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProfileSuggestionEntity)
    private readonly suggestionRepo: Repository<ProfileSuggestionEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional()
    private readonly legacyAdapter?: ProfileLegacyAdapterService,
    @Optional()
    private readonly externalSnapshotService?: ProfileExternalSnapshotService,
  ) {}

  async getProfile(userId: number) {
    const user = await this.findUser(userId);
    return normalizeProfileRecord(
      this.parseProfileJson(user.profileJson),
      user.displayName,
    );
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const source = dto.profile ?? dto;
    if (!hasProfileInputFields(source)) {
      throw new BadRequestException({
        code: 'PROFILE_VALIDATION_FAILED',
        message: 'profile must contain at least one supported profile field',
      });
    }

    if (!this.dataSource || !this.legacyAdapter) {
      throw new InternalServerErrorException({
        code: 'PROFILE_V2_STORE_UNAVAILABLE',
        message: 'Profile V2 storage is unavailable',
      });
    }

    const user = await this.findUser(userId);
    const profile = normalizeProfileRecord(source, user.displayName);
    if (dto.suggestionRowId) {
      const suggestion = await this.suggestionRepo.findOne({
        where: {
          rowId: dto.suggestionRowId,
          userId,
          status: 'pending',
        },
      });
      if (
        suggestion
        && !this.profileContainsPatch(
          profile,
          this.parsePatchJson(suggestion.patchJson),
        )
      ) {
        throw new BadRequestException({
          code: 'PROFILE_SUGGESTION_PATCH_NOT_APPLIED',
          message: 'saved profile does not contain the accepted suggestion',
        });
      }
    }
    return this.legacyAdapter.apply(userId, profile, dto.suggestionRowId);
  }

  async rejectSuggestion(userId: number, rowId: number) {
    const suggestion = await this.suggestionRepo.findOne({
      where: { rowId, userId, status: 'pending' },
    });
    if (!suggestion) {
      throw new NotFoundException({
        code: 'PROFILE_SUGGESTION_NOT_FOUND',
        message: 'pending profile suggestion not found',
      });
    }
    suggestion.status = 'rejected';
    suggestion.resolvedAt = new Date();
    await this.suggestionRepo.save(suggestion);
    return { success: true };
  }

  async getCurrentProfileSnapshot(userId: number) {
    if (!this.externalSnapshotService) {
      throw new InternalServerErrorException({
        code: 'PROFILE_V2_STORE_UNAVAILABLE',
        message: 'Profile V2 snapshot storage is unavailable',
      });
    }
    return this.externalSnapshotService.getCurrentSnapshot(userId);
  }

  async listSuggestions(userId: number): Promise<ProfileSuggestion[]> {
    if (!profileFeatureFlags.legacySuggestionExtraction()) return [];
    const suggestions = await this.suggestionRepo.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'DESC', rowId: 'DESC' },
    });

    const seen = new Set<string>();
    const results: ProfileSuggestion[] = [];
    for (const entity of suggestions) {
      const suggestion = this.toProfileSuggestion(entity);
      if (!suggestion) {
        continue;
      }
      const key = this.suggestionKey(suggestion);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      results.push(suggestion);
    }

    return results;
  }

  async saveSuggestionsFromOutput({
    userId,
    output,
    sourceThreadId = null,
  }: SaveSuggestionsFromOutputInput): Promise<ProfileSuggestion[]> {
    if (!profileFeatureFlags.legacySuggestionExtraction()) return [];
    const candidates = this.extractSuggestionCandidates(output);
    const saved: ProfileSuggestion[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const suggestion = this.normalizeSuggestionCandidate(
        candidate,
        sourceThreadId,
      );
      if (!suggestion) {
        continue;
      }

      const key = this.suggestionKey(suggestion);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const existing = await this.suggestionRepo.findOne({
        where: {
          userId,
          id: suggestion.id,
          sourceThreadId: suggestion.sourceThreadId,
          status: 'pending',
        },
      });
      const entity = this.suggestionRepo.create({
        ...(existing ?? {}),
        id: suggestion.id,
        userId,
        title: suggestion.title,
        rationale: suggestion.rationale,
        sourceThreadId: suggestion.sourceThreadId,
        patchJson: JSON.stringify(suggestion.patch),
        status: 'pending',
      });
      const persisted = await this.suggestionRepo.save(entity);
      const nextSuggestion = this.toProfileSuggestion(persisted);
      if (nextSuggestion) {
        saved.push(nextSuggestion);
      }
    }

    return saved;
  }

  private async findUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }
    return user;
  }

  private parseProfileJson(raw: string | null | undefined) {
    if (!raw) {
      return createDefaultProfile();
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return createDefaultProfile();
    }
  }

  private toProfileSuggestion(
    entity: ProfileSuggestionEntity,
  ): ProfileSuggestion | null {
    const patch = this.parsePatchJson(entity.patchJson);
    if (!hasProfilePatchFields(patch)) {
      return null;
    }

    return {
      rowId: entity.rowId,
      id: entity.id,
      title: entity.title,
      rationale: entity.rationale,
      sourceThreadId: entity.sourceThreadId ?? null,
      patch,
    };
  }

  private suggestionKey(suggestion: Pick<ProfileSuggestion, 'id' | 'sourceThreadId'>) {
    return `${suggestion.id}\n${suggestion.sourceThreadId ?? ''}`;
  }

  private parsePatchJson(raw: string): DeepPartial<ProfileRecord> {
    try {
      return normalizeProfilePatch(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
  }

  private profileContainsPatch(
    profile: ProfileRecord,
    patch: DeepPartial<ProfileRecord>,
  ) {
    const matches = (actual: unknown, expected: unknown): boolean => {
      if (Array.isArray(expected)) {
        return (
          Array.isArray(actual)
          && JSON.stringify(actual) === JSON.stringify(expected)
        );
      }
      if (
        typeof expected === 'object'
        && expected !== null
        && !Array.isArray(expected)
      ) {
        if (typeof actual !== 'object' || actual === null) {
          return false;
        }
        return Object.entries(expected).every(([key, value]) =>
          matches((actual as Record<string, unknown>)[key], value));
      }
      return actual === expected;
    };

    return matches(profile, patch);
  }

  private normalizeSuggestionCandidate(
    candidate: unknown,
    fallbackSourceThreadId: string | null,
  ): ProfileSuggestion | null {
    if (!this.isRecord(candidate)) {
      return null;
    }

    const patch = normalizeProfilePatch(candidate.patch);
    if (!hasProfilePatchFields(patch)) {
      return null;
    }

    const title = this.normalizeText(candidate.title);
    const rationale = this.normalizeText(candidate.rationale);
    if (!title || !rationale) {
      return null;
    }

    const id = this.normalizeText(candidate.id)
      || `suggestion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sourceThreadId =
      this.normalizeNullableText(candidate.sourceThreadId)
      ?? this.normalizeNullableText(candidate.source_thread_id)
      ?? fallbackSourceThreadId;

    return {
      id,
      title,
      rationale,
      sourceThreadId,
      patch,
    };
  }

  private extractSuggestionCandidates(output: unknown): unknown[] {
    const candidates: unknown[] = [];
    const visit = (value: unknown, depth = 0) => {
      if (depth > 8) {
        return;
      }

      if (typeof value === 'string') {
        for (const parsed of this.extractJsonValuesFromText(value)) {
          visit(parsed, depth + 1);
        }
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, depth + 1);
        }
        return;
      }

      if (!this.isRecord(value)) {
        return;
      }

      const profileSuggestion =
        value.profile_suggestion ?? value.profileSuggestion;
      const profileSuggestions =
        value.profile_suggestions ?? value.profileSuggestions;

      if (profileSuggestion !== undefined) {
        visit(profileSuggestion, depth + 1);
      }
      if (profileSuggestions !== undefined) {
        visit(profileSuggestions, depth + 1);
      }

      if (
        value.patch !== undefined &&
        value.title !== undefined &&
        value.rationale !== undefined
      ) {
        candidates.push(value);
      }

      if (value.reply !== undefined) {
        visit(value.reply, depth + 1);
      }
      if (value.metadata !== undefined) {
        visit(value.metadata, depth + 1);
      }
      if (value.raw !== undefined) {
        visit(value.raw, depth + 1);
      }
    };

    visit(output);
    return candidates;
  }

  private extractJsonValuesFromText(text: string): unknown[] {
    const values: unknown[] = [];
    const trimmed = text.trim();
    if (!trimmed) {
      return values;
    }

    this.tryPushParsedJson(values, trimmed);

    const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
    for (const match of trimmed.matchAll(fencePattern)) {
      this.tryPushParsedJson(values, match[1].trim());
    }

    for (const marker of ['"profile_suggestion"', '"profileSuggestion"']) {
      let index = trimmed.indexOf(marker);
      while (index !== -1) {
        const objectStart = trimmed.lastIndexOf('{', index);
        if (objectStart !== -1) {
          const objectText = this.readBalancedJsonObject(trimmed, objectStart);
          if (objectText) {
            this.tryPushParsedJson(values, objectText);
          }
        }
        index = trimmed.indexOf(marker, index + marker.length);
      }
    }

    return values;
  }

  private readBalancedJsonObject(text: string, startIndex: number) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return null;
  }

  private tryPushParsedJson(values: unknown[], text: string) {
    try {
      values.push(JSON.parse(text) as unknown);
    } catch {
      // Ignore narrative text and non-JSON snippets.
    }
  }

  private normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeNullableText(value: unknown) {
    const text = this.normalizeText(value);
    return text || null;
  }

  private isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
