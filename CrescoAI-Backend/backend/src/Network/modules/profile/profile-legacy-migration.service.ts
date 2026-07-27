import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { ProfileSuggestionEntity } from './entities/profile-suggestion.entity';
import { profileFeatureFlags } from './profile-feature-flags';
import { ProfileMemoryService } from './profile-memory.service';
import { ProfileProposalService } from './profile-proposal.service';
import { normalizeProfileRecord } from './profile.types';
import type { ProfileMemoryCandidate } from './profile-v2.types';

@Injectable()
export class ProfileLegacyMigrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileLegacyMigrationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProfileSuggestionEntity)
    private readonly legacySuggestionRepo: Repository<ProfileSuggestionEntity>,
    private readonly memoryService: ProfileMemoryService,
    private readonly proposalService: ProfileProposalService,
  ) {}

  onModuleInit() {
    if (!profileFeatureFlags.legacyMigration()) return;
    void this.migrateAll();
    this.timer = setInterval(() => void this.migrateAll(), 5 * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async migrateAll() {
    if (this.running) return { users: 0, skipped: true };
    this.running = true;
    try {
      const users = await this.userRepo.find();
      for (const user of users) {
        try {
          await this.migrateUser(user);
        } catch (error) {
          this.logger.warn(`Legacy Profile migration failed for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return { users: users.length, skipped: false };
    } finally {
      this.running = false;
    }
  }

  private async migrateUser(user: UserEntity) {
    const legacy = normalizeProfileRecord(this.parseObject(user.profileJson), user.displayName ?? '');
    let migratedOrExisting = await this.memoryService.listAllForProjection(user.id);
    for (const candidate of this.toMemoryCandidates(legacy)) {
      const duplicate = migratedOrExisting.some((item) =>
        item.category === candidate.category
        && item.content.trim().toLowerCase() === candidate.content.trim().toLowerCase());
      if (duplicate) continue;
      const slotConflicts = candidate.slotKey
        ? migratedOrExisting
            .filter((item) => item.status === 'active' && item.slotKey === candidate.slotKey)
        : [];
      if (slotConflicts.some((item) => item.sourceType !== 'system_migration')) continue;
      const conflictIds = slotConflicts.map((item) => item.id);
      await this.memoryService.applyCandidate(user.id, candidate, conflictIds, {
        sourceType: 'system_migration', actorType: 'system', userConfirmed: false, updateLevel: 'L2',
      });
      migratedOrExisting = await this.memoryService.listAllForProjection(user.id);
    }
    const suggestions = await this.legacySuggestionRepo.find({ where: { userId: user.id, status: 'pending' } });
    for (const suggestion of suggestions) {
      const patch = this.parseObject(suggestion.patchJson);
      for (const candidate of this.patchToCandidates(patch, suggestion.sourceThreadId)) {
        await this.proposalService.importLegacyMemoryProposal(user.id, candidate, `由旧画像建议迁移：${suggestion.rationale}`);
      }
      const basePatch = this.patchToBasePatch(patch);
      if (Object.keys(basePatch).length) {
        await this.proposalService.proposeBase(user.id, {
          patch: basePatch,
          rationale: `由旧基础画像建议迁移：${suggestion.rationale}`,
          sourceType: 'user_explicit',
          sourceConversationId: suggestion.sourceThreadId ?? undefined,
        });
      }
    }
  }

  private toMemoryCandidates(legacy: ReturnType<typeof normalizeProfileRecord>) {
    const intent = legacy.intentConstraints;
    const rows: ProfileMemoryCandidate[] = [];
    const add = (content: string, category: string, slotKey: string, timeScope: 'long_term' | 'short_term', priority: 'high' | 'normal', appliesTo: string[]) => {
      if (content.trim()) rows.push({ content: content.trim(), category, level: 'L2', slotKey, timeScope, priority, appliesTo, sourceType: 'system_migration' });
    };
    add(intent.targetRole, 'goal', 'career.target_role', 'short_term', 'high', ['job', 'resume', 'interview']);
    add(intent.targetIndustry, 'goal', 'career.target_industry', 'short_term', 'high', ['job', 'career']);
    for (const industry of intent.targetIndustries) {
      add(industry, 'goal', '', 'short_term', 'normal', ['job', 'career']);
    }
    add(intent.targetCity, 'constraint', 'work.location', 'short_term', 'high', ['job', 'location']);
    add(intent.expectedSalary, 'compensation', 'work.compensation', 'short_term', 'normal', ['job', 'compensation']);
    add(intent.jobSearchStatus, 'goal', 'career.search_status', 'short_term', 'high', ['job', 'career']);
    add(intent.careerGoal, 'goal', 'career.direction', 'long_term', 'high', ['career', 'job']);
    for (const value of intent.constraints) add(value, 'constraint', '', 'long_term', 'normal', ['job', 'career']);
    for (const value of intent.workPreferences) add(value, 'preference', '', 'long_term', 'normal', ['job', 'work']);
    for (const value of intent.learningPreferences) add(value, 'preference', '', 'long_term', 'normal', ['learning']);
    return rows;
  }

  private patchToCandidates(patch: Record<string, unknown>, sourceConversationId: string | null) {
    const intent = this.asObject(patch.intentConstraints ?? patch.intent_constraints);
    const candidates: ProfileMemoryCandidate[] = [];
    const add = (value: unknown, category: string, slotKey: string, scope: 'long_term' | 'short_term') => {
      if (typeof value === 'string' && value.trim()) candidates.push({
        content: value.trim(), category, level: 'L3', slotKey, timeScope: scope,
        priority: category === 'goal' ? 'high' : 'normal',
        sourceType: 'agent_summary', sourceConversationId,
      });
    };
    add(intent.targetRole ?? intent.target_role, 'goal', 'career.target_role', 'short_term');
    add(intent.targetIndustry ?? intent.target_industry, 'goal', 'career.target_industry', 'short_term');
    add(intent.targetCity ?? intent.target_city, 'constraint', 'work.location', 'short_term');
    add(intent.expectedSalary ?? intent.expected_salary, 'compensation', 'work.compensation', 'short_term');
    add(intent.careerGoal ?? intent.career_goal, 'goal', 'career.direction', 'long_term');
    for (const key of ['constraints', 'workPreferences', 'work_preferences', 'learningPreferences', 'learning_preferences']) {
      const values = intent[key];
      if (Array.isArray(values)) {
        for (const value of values) add(value, key.includes('constraint') ? 'constraint' : 'preference', '', 'long_term');
      }
    }
    return candidates;
  }

  private patchToBasePatch(patch: Record<string, unknown>) {
    const basic = this.asObject(patch.basicInfo ?? patch.basic_info);
    const career = this.asObject(patch.careerProfile ?? patch.career_profile);
    const result: Record<string, unknown> = {};
    const assign = (target: string, value: unknown) => {
      if (typeof value === 'string' && value.trim()) result[target] = value.trim();
    };
    assign('name', basic.fullName ?? basic.full_name);
    assign('currentCity', basic.currentCity ?? basic.current_city);
    assign('currentRole', career.currentRole ?? career.current_role);
    assign('currentStatus', career.employmentStatus ?? career.employment_status);
    return result;
  }

  private parseObject(raw: string) {
    try { return this.asObject(JSON.parse(raw) as unknown); } catch { return {}; }
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  }
}
