import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposeBaseProfileDto, ProposeProfileMemoryDto } from './dto/profile-proposal.dto';
import { ProfileChangeProposalEntity } from './entities/profile-change-proposal.entity';
import { profileAccessDenied, profileConfirmationRequired, profileResourceNotFound } from './profile.errors';
import { profileFeatureFlags } from './profile-feature-flags';
import { ProfileMemoryService } from './profile-memory.service';
import { ProfilePolicyService } from './profile-policy.service';
import { ProfileV2Service } from './profile-v2.service';
import type {
  BaseProfilePatch,
  ProfileChangeProposalRecord,
  ProfileMemoryCandidate,
} from './profile-v2.types';

@Injectable()
export class ProfileProposalService {
  constructor(
    @InjectRepository(ProfileChangeProposalEntity)
    private readonly proposalRepo: Repository<ProfileChangeProposalEntity>,
    private readonly policy: ProfilePolicyService,
    private readonly memoryService: ProfileMemoryService,
    private readonly baseService: ProfileV2Service,
  ) {}

  async list(userId: number, status: 'pending' | 'applied' | 'rejected' | 'expired' = 'pending') {
    const rows = await this.proposalRepo.find({
      where: { userId, status },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async proposeMemory(userId: number, input: ProposeProfileMemoryDto) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    const candidate: ProfileMemoryCandidate = {
      content: input.content,
      category: input.category.trim().toLowerCase(),
      level: input.level,
      slotKey: input.slotKey?.trim().toLowerCase(),
      appliesTo: input.appliesTo?.map((item) => item.trim().toLowerCase()).filter(Boolean),
      timeScope: input.timeScope,
      priority: input.priority,
      sourceType: input.sourceType,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      expiresAt: input.expiresAt ?? null,
    };
    if (candidate.timeScope === 'short_term' && !candidate.expiresAt) {
      const reviewAt = new Date();
      reviewAt.setUTCDate(reviewAt.getUTCDate() + 60);
      candidate.expiresAt = reviewAt.toISOString();
    }
    const active = await this.memoryService.findActiveEntities(userId);
    const duplicate = active.find((item) =>
      item.category === candidate.category
      && item.content.trim().toLowerCase() === candidate.content.trim().toLowerCase());
    if (duplicate) {
      return {
        decision: {
          level: 'L0' as const,
          action: 'ignore' as const,
          reasons: ['equivalent active Profile item already exists'],
          conflictIds: [],
          confirmationRequired: false,
        },
        proposal: null,
        appliedMemory: this.memoryService.toRecord(duplicate),
      };
    }
    let decision = this.policy.evaluateMemory(candidate, active);
    if (decision.action === 'apply') {
      const enabled = this.autoApplyEnabled(decision.level);
      if (!enabled) {
        decision = {
          ...decision,
          action: 'propose',
          confirmationRequired: true,
          reasons: [...decision.reasons, `${decision.level} auto-apply is disabled`],
        };
      }
    }
    if (decision.action === 'ignore') return { decision, proposal: null, appliedMemory: null };

    const proposal = await this.saveProposal(userId, {
      targetType: 'memory',
      operation: decision.conflictIds.length ? 'supersede' : 'create',
      candidate: candidate as unknown as Record<string, unknown>,
      currentValue: decision.conflictIds.length
        ? this.memoryService.toRecord(
            active.find((item) => item.id === decision.conflictIds[0])!,
          ) as unknown as Record<string, unknown>
        : null,
      conflictIds: decision.conflictIds,
      rationale: input.rationale,
      updateLevel: decision.level,
      confirmationRequired: decision.confirmationRequired,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    });
    if (decision.action === 'apply') {
      if (proposal.status === 'applied') {
        return { decision, proposal, appliedMemory: null };
      }
      if (proposal.confirmationRequired) {
        return {
          decision: {
            ...decision,
            action: 'propose' as const,
            confirmationRequired: true,
            reasons: [...decision.reasons, 'existing proposal retains its original confirmation requirement'],
          },
          proposal,
          appliedMemory: null,
        };
      }
      const resolved = await this.apply(userId, proposal.id, false, 'agent');
      return { decision, proposal: resolved.proposal, appliedMemory: resolved.appliedMemory };
    }
    return { decision, proposal, appliedMemory: null };
  }

  async proposeBase(userId: number, input: ProposeBaseProfileDto) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    const [base, state] = await Promise.all([
      this.baseService.getBaseProfile(userId),
      this.baseService.getState(userId),
    ]);
    const autoApply = profileFeatureFlags.l3AutoApply();
    const proposal = await this.saveProposal(userId, {
      targetType: 'base_profile',
      operation: 'update',
      candidate: input.patch,
      currentValue: base as unknown as Record<string, unknown>,
      conflictIds: [],
      rationale: input.rationale,
      updateLevel: 'L3',
      confirmationRequired: !autoApply,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
      baseVersion: state.aggregateVersion,
    });
    if (!autoApply || proposal.status === 'applied' || proposal.confirmationRequired) return proposal;
    const resolved = await this.apply(userId, proposal.id, false, 'agent');
    return resolved.proposal;
  }

  async importLegacyMemoryProposal(
    userId: number,
    candidate: ProfileMemoryCandidate,
    rationale: string,
  ) {
    const autoApply = profileFeatureFlags.l3AutoApply();
    const proposal = await this.saveProposal(userId, {
      targetType: 'memory',
      operation: 'create',
      candidate: candidate as unknown as Record<string, unknown>,
      currentValue: null,
      conflictIds: [],
      rationale,
      updateLevel: 'L3',
      confirmationRequired: !autoApply,
      sourceConversationId: candidate.sourceConversationId ?? null,
      sourceMessageId: candidate.sourceMessageId ?? null,
    });
    if (!autoApply || proposal.status === 'applied' || proposal.confirmationRequired) return proposal;
    const resolved = await this.apply(userId, proposal.id, false, 'agent');
    return resolved.proposal;
  }

  async accept(userId: number, id: string) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    return this.apply(userId, id, true, 'user');
  }

  async reject(userId: number, id: string) {
    if (!profileFeatureFlags.v2Write()) throw profileAccessDenied('Profile V2 writes are disabled');
    const entity = await this.getPending(userId, id);
    entity.status = 'rejected';
    entity.resolvedAt = new Date();
    return this.toRecord(await this.proposalRepo.save(entity));
  }

  async apply(
    userId: number,
    id: string,
    userConfirmed: boolean,
    actorType: 'user' | 'agent',
  ) {
    const entity = await this.getPending(userId, id);
    if (entity.confirmationRequired && !userConfirmed) {
      throw profileConfirmationRequired(id);
    }
    const candidate = this.parseObject(entity.candidateJson);
    let appliedMemory = null;
    if (entity.targetType === 'memory') {
      appliedMemory = await this.memoryService.applyCandidate(
        userId,
        candidate as unknown as ProfileMemoryCandidate,
        this.parseList(entity.conflictIdsJson),
        {
          sourceType: userConfirmed ? 'user_confirmed' : 'user_explicit',
          sourceConversationId: entity.sourceConversationId,
          sourceMessageId: entity.sourceMessageId,
          userConfirmed,
          updateLevel: entity.updateLevel,
          actorType,
        },
      );
    } else {
      const base = await this.baseService.getBaseProfile(userId);
      await this.baseService.updateBaseProfile(userId, candidate as BaseProfilePatch, {
        sourceType: userConfirmed ? 'user_confirmed' : 'user_explicit',
        expectedVersion: base.version,
        sourceConversationId: entity.sourceConversationId,
        sourceMessageId: entity.sourceMessageId,
        userConfirmed,
        updateLevel: 'L3',
        actorType,
      });
    }
    entity.status = 'applied';
    entity.resolvedAt = new Date();
    const saved = await this.proposalRepo.save(entity);
    return { proposal: this.toRecord(saved), appliedMemory };
  }

  private async saveProposal(
    userId: number,
    input: {
      targetType: 'base_profile' | 'memory';
      operation: 'create' | 'update' | 'supersede' | 'delete' | 'expire';
      candidate: Record<string, unknown>;
      currentValue: Record<string, unknown> | null;
      conflictIds: string[];
      rationale: string;
      updateLevel: 'L0' | 'L1' | 'L2' | 'L3';
      confirmationRequired: boolean;
      sourceConversationId: string | null;
      sourceMessageId: string | null;
      baseVersion?: number;
    },
  ) {
    const state = await this.baseService.getState(userId);
    const idempotencyKey = createHash('sha256').update(JSON.stringify({
      userId,
      targetType: input.targetType,
      candidate: input.candidate,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
    })).digest('hex');
    const existing = await this.proposalRepo.findOne({ where: { userId, idempotencyKey } });
    if (existing) return this.toRecord(existing);
    const entity = this.proposalRepo.create({
      id: randomUUID(),
      userId,
      targetType: input.targetType,
      operation: input.operation,
      candidateJson: JSON.stringify(input.candidate),
      currentValueJson: input.currentValue ? JSON.stringify(input.currentValue) : null,
      conflictIdsJson: JSON.stringify(input.conflictIds),
      rationale: input.rationale,
      updateLevel: input.updateLevel,
      confirmationRequired: input.confirmationRequired,
      status: 'pending',
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      baseVersion: input.baseVersion ?? state.aggregateVersion,
      idempotencyKey,
      resolvedAt: null,
    });
    return this.toRecord(await this.proposalRepo.save(entity));
  }

  private autoApplyEnabled(level: 'L0' | 'L1' | 'L2' | 'L3') {
    if (level === 'L1') return profileFeatureFlags.l1AutoApply();
    if (level === 'L2') return profileFeatureFlags.l2AutoApply();
    if (level === 'L3') return profileFeatureFlags.l3AutoApply();
    return false;
  }

  private async getPending(userId: number, id: string) {
    const entity = await this.proposalRepo.findOne({ where: { id, userId, status: 'pending' } });
    if (!entity) throw profileResourceNotFound('profile proposal', id);
    return entity;
  }

  private toRecord(entity: ProfileChangeProposalEntity): ProfileChangeProposalRecord {
    return {
      id: entity.id,
      targetType: entity.targetType,
      operation: entity.operation,
      candidate: this.parseObject(entity.candidateJson),
      currentValue: entity.currentValueJson ? this.parseObject(entity.currentValueJson) : null,
      conflictIds: this.parseList(entity.conflictIdsJson),
      rationale: entity.rationale,
      updateLevel: entity.updateLevel,
      confirmationRequired: entity.confirmationRequired,
      status: entity.status,
      sourceConversationId: entity.sourceConversationId,
      sourceMessageId: entity.sourceMessageId,
      baseVersion: entity.baseVersion,
      createdAt: entity.createdAt.toISOString(),
      resolvedAt: entity.resolvedAt?.toISOString() ?? null,
    };
  }

  private parseObject(raw: string) {
    try {
      const value = JSON.parse(raw) as unknown;
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
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
