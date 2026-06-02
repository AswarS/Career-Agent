import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';

export type ProfileRecord = Record<string, unknown>;

interface ProfileSuggestion {
  id: string;
  title: string;
  rationale: string;
  source_thread_id?: string;
  sourceThreadId?: string;
  patch: ProfileRecord;
}

const stringFieldPairs = [
  ['display_name', 'displayName'],
  ['current_role', 'currentRole'],
  ['employment_status', 'employmentStatus'],
  ['experience_summary', 'experienceSummary'],
  ['education_summary', 'educationSummary'],
  ['location_region', 'locationRegion'],
  ['target_role', 'targetRole'],
  ['short_term_goal', 'shortTermGoal'],
  ['long_term_goal', 'longTermGoal'],
  ['weekly_time_budget', 'weeklyTimeBudget'],
] as const;

const arrayFieldPairs = [
  ['target_industries', 'targetIndustries'],
  ['work_preferences', 'workPreferences'],
  ['learning_preferences', 'learningPreferences'],
  ['key_strengths', 'keyStrengths'],
  ['risk_signals', 'riskSignals'],
  ['portfolio_links', 'portfolioLinks'],
] as const;

const standaloneStringFields = new Set(['locale', 'timezone']);
const standaloneArrayFields = new Set(['constraints']);
const stringFields = new Set([
  ...standaloneStringFields,
  ...stringFieldPairs.flatMap(([snake, camel]) => [snake, camel]),
]);
const arrayFields = new Set([
  ...standaloneArrayFields,
  ...arrayFieldPairs.flatMap(([snake, camel]) => [snake, camel]),
]);

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async getProfile(userId: number): Promise<ProfileRecord> {
    const user = await this.getUser(userId);
    return this.ensureProfileDefaults(this.parseProfile(user.profileJson), user);
  }

  async updateProfile(
    userId: number,
    profile: ProfileRecord,
  ): Promise<ProfileRecord> {
    const user = await this.getUser(userId);
    const normalized = this.normalizeProfile(profile);
    const nextProfile = this.ensureProfileDefaults(normalized, user);

    const displayName =
      this.getString(nextProfile.display_name) ??
      this.getString(nextProfile.displayName);
    if (displayName) {
      user.displayName = displayName;
    }

    user.profileJson = JSON.stringify(nextProfile);
    await this.userRepo.save(user);
    return nextProfile;
  }

  async getSuggestions(userId: number): Promise<ProfileSuggestion[]> {
    const profile = await this.getProfile(userId);
    const suggestions: ProfileSuggestion[] = [];

    if (!this.getString(profile.target_role) && !this.getString(profile.targetRole)) {
      suggestions.push({
        id: 'suggestion-target-role',
        title: 'Add target role',
        rationale: 'The target role is empty. Adding one helps focus future guidance.',
        patch: {
          target_role: '',
        },
      });
    }

    if (
      !this.getString(profile.short_term_goal) &&
      !this.getString(profile.shortTermGoal)
    ) {
      suggestions.push({
        id: 'suggestion-short-term-goal',
        title: 'Add short-term goal',
        rationale: 'The short-term goal is empty. Adding one helps generate actionable plans.',
        patch: {
          short_term_goal: '',
        },
      });
    }

    return suggestions;
  }

  private async getUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return user;
  }

  private parseProfile(raw: string | undefined): ProfileRecord {
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return this.isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private normalizeProfile(profile: ProfileRecord): ProfileRecord {
    if (!this.isPlainObject(profile)) {
      throw new BadRequestException({
        code: 'PROFILE_VALIDATION_FAILED',
        message: 'profile must be an object',
      });
    }

    const normalized: ProfileRecord = {};

    for (const [key, value] of Object.entries(profile)) {
      if (value === undefined) {
        continue;
      }

      if (value === null) {
        normalized[key] = value;
        continue;
      }

      if (stringFields.has(key)) {
        if (typeof value !== 'string') {
          throw this.profileValidationError(`${key} must be a string`);
        }
        normalized[key] = value.trim();
        continue;
      }

      if (arrayFields.has(key)) {
        if (!Array.isArray(value)) {
          throw this.profileValidationError(`${key} must be an array`);
        }
        normalized[key] = value;
        continue;
      }

      if (this.isJsonValue(value)) {
        normalized[key] = value;
        continue;
      }

      throw this.profileValidationError(`${key} is not a valid JSON value`);
    }

    return normalized;
  }

  private ensureProfileDefaults(
    profile: ProfileRecord,
    user: UserEntity,
  ): ProfileRecord {
    const displayName =
      this.getString(profile.display_name) ??
      this.getString(profile.displayName) ??
      user.displayName ??
      user.username ??
      user.email?.split('@')[0] ??
      'User';
    const result: ProfileRecord = {
      ...profile,
      display_name: displayName,
      displayName,
      locale: this.getString(profile.locale) ?? 'zh-CN',
      timezone: this.getString(profile.timezone) ?? 'Asia/Shanghai',
      constraints: this.getArray(profile.constraints) ?? [],
    };

    for (const [snake, camel] of stringFieldPairs) {
      const value =
        snake === 'display_name'
          ? displayName
          : this.getString(profile[snake]) ?? this.getString(profile[camel]) ?? '';
      result[snake] = value;
      result[camel] = value;
    }

    for (const [snake, camel] of arrayFieldPairs) {
      const value = this.getArray(profile[snake]) ?? this.getArray(profile[camel]) ?? [];
      result[snake] = value;
      result[camel] = value;
    }

    return result;
  }

  private profileValidationError(message: string) {
    return new BadRequestException({
      code: 'PROFILE_VALIDATION_FAILED',
      message,
    });
  }

  private getString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getArray(value: unknown) {
    return Array.isArray(value) ? value : undefined;
  }

  private isPlainObject(value: unknown): value is ProfileRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isJsonValue(value: unknown): boolean {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.isJsonValue(item));
    }

    if (this.isPlainObject(value)) {
      return Object.values(value).every((item) => this.isJsonValue(item));
    }

    return false;
  }
}
