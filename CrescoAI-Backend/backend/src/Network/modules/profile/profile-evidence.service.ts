import { createHash, randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  resolveConversationEvidenceUnit,
  resolveConversationEvidenceUnits,
} from '../../memory/conversationMemoryIndex.js';
import type { ConversationMemoryEvidenceUnit } from '../../memory/conversationMemoryTypes.js';
import { getNetworkConversationMemoryDir } from '../../utils/networkTranscriptStorage.js';
import { sanitizeConversationMemoryPublicText } from '../../memory/conversationMemoryPublicPolicy.js';
import { sanitizeServerPhysicalPaths } from '../../utils/publicOutputSanitizer.js';
import { ProfileEvidenceLinkEntity } from './entities/profile-evidence-link.entity';
import type { ProfileProductFieldKey, ProfileProductValue } from './profile-product.types';
import { ConversationEntity } from '../conversation/entities/conversation.entity';

export type ProfileEvidenceTarget = {
  fieldKey: ProfileProductFieldKey;
  value?: ProfileProductValue | string;
  targetType: 'base_field' | 'memory_value';
  profileMemoryItemId?: string | null;
  profileItemVersion?: number | null;
};

@Injectable()
export class ProfileEvidenceService {
  constructor(
    @InjectRepository(ProfileEvidenceLinkEntity)
    private readonly repository: Repository<ProfileEvidenceLinkEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
  ) {}

  valueKey(fieldKey: ProfileProductFieldKey, value: unknown): string | null {
    if (value === undefined || value === null || !Array.isArray(value) && typeof value !== 'string') {
      return null;
    }
    const normalized = typeof value === 'string'
      ? value.normalize('NFKC').trim().toLocaleLowerCase()
      : JSON.stringify(value);
    return createHash('sha256').update(`${fieldKey}\0${normalized}`).digest('hex');
  }

  itemKey(fieldKey: ProfileProductFieldKey, value: string): string {
    return `pi_${this.valueKey(fieldKey, value)!.slice(0, 20)}`;
  }

  async attach(
    userId: number,
    target: ProfileEvidenceTarget,
    unit: ConversationMemoryEvidenceUnit,
    options: { refreshJobId?: string | null; origin?: 'current_turn' | 'profile_refresh' } = {},
  ): Promise<ProfileEvidenceLinkEntity> {
    const valueKey = typeof target.value === 'string'
      ? this.valueKey(target.fieldKey, target.value)
      : null;
    const existing = await this.repository.findOne({
      where: {
        userId,
        fieldKey: target.fieldKey,
        valueKey: valueKey ?? IsNull(),
        conversationId: unit.conversationId,
        evidenceUnitId: unit.unitId,
        status: 'active',
      },
    });
    if (existing) return existing;
    return this.repository.save(this.repository.create({
      id: randomUUID(),
      publicRef: `pev_${randomUUID().replaceAll('-', '')}`,
      userId,
      targetType: target.targetType,
      fieldKey: target.fieldKey,
      profileMemoryItemId: target.profileMemoryItemId ?? null,
      profileItemVersion: target.profileItemVersion ?? null,
      valueKey,
      conversationId: unit.conversationId,
      sourceMessageId: unit.sourceTurnId,
      evidenceUnitId: unit.unitId,
      contentHash: unit.contentHash,
      summaryRevision: unit.summaryRevision,
      sourceUpdatedAt: this.safeDate(unit.summaryUpdatedAt),
      evidenceStrength: unit.sourcePrecision === 'turn' ? 'user_explicit' : 'grounded_summary',
      origin: options.origin ?? 'profile_refresh',
      status: 'active',
      invalidatedReason: null,
      refreshJobId: options.refreshJobId ?? null,
    }));
  }

  async getActiveLinks(userId: number, fieldKeys?: ProfileProductFieldKey[]) {
    return this.repository.find({
      where: {
        userId,
        status: 'active',
        ...(fieldKeys?.length ? { fieldKey: In(fieldKeys) } : {}),
      },
      order: { sourceUpdatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async invalidateConversation(userId: number, conversationId: string) {
    await this.repository.update(
      { userId, conversationId, status: 'active' },
      { status: 'invalidated', invalidatedReason: 'conversation_deleted' },
    );
  }

  async invalidateTarget(
    userId: number,
    fieldKey: ProfileProductFieldKey,
    value?: string,
  ) {
    await this.repository.update(
      {
        userId,
        fieldKey,
        valueKey: value === undefined ? IsNull() : this.valueKey(fieldKey, value)!,
        status: 'active',
      },
      { status: 'invalidated', invalidatedReason: 'profile_value_changed' },
    );
  }

  async resolvePublic(userId: number, publicRef: string) {
    const anchor = await this.repository.findOne({
      where: { userId, publicRef, status: 'active' },
    });
    if (!anchor?.evidenceUnitId) throw new NotFoundException('Related conversation is unavailable');
    const links = await this.repository.find({
      where: {
        userId,
        fieldKey: anchor.fieldKey,
        valueKey: anchor.valueKey ?? IsNull(),
        status: 'active',
      },
      order: { sourceUpdatedAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    const rootDir = getNetworkConversationMemoryDir(String(userId));
    const units = await resolveConversationEvidenceUnits(
      rootDir,
      links.flatMap((link) => link.evidenceUnitId ? [link.evidenceUnitId] : []),
    );
    const conversationRows = await this.conversations.find({
      where: {
        userId,
        id: In([...new Set(links.map((link) => link.conversationId))]),
      },
    });
    const conversationById = new Map(conversationRows.map((conversation) => [conversation.id, conversation]));
    const privateIds = new Set(links.map((link) => link.conversationId));
    const resolved = new Map<string, {
      ref: string;
      title: string;
      updatedAt: string;
      excerpt: string;
      openConversationRef: string;
    }>();
    for (const link of links) {
      const unit = link.evidenceUnitId ? units.get(link.evidenceUnitId) : undefined;
      const conversation = conversationById.get(link.conversationId);
      if (!unit || unit.conversationId !== link.conversationId || !conversation) {
        await this.repository.update({ id: link.id }, {
          status: 'invalidated', invalidatedReason: 'conversation_unavailable',
        });
        continue;
      }
      if (unit.contentHash !== link.contentHash) {
        await this.repository.update({ id: link.id }, {
          status: 'stale', invalidatedReason: 'summary_changed',
        });
        continue;
      }
      if (resolved.has(link.conversationId)) continue;
      resolved.set(link.conversationId, {
        ref: link.publicRef,
        title: sanitizeServerPhysicalPaths(
          sanitizeConversationMemoryPublicText(conversation.title?.trim() || unit.heading, privateIds),
        ),
        updatedAt: unit.summaryUpdatedAt,
        excerpt: sanitizeServerPhysicalPaths(
          sanitizeConversationMemoryPublicText(unit.content.slice(0, 800), privateIds),
        ),
        openConversationRef: link.publicRef,
      });
    }
    const relatedConversations = [...resolved.values()];
    if (!relatedConversations.length) {
      throw new NotFoundException('Related conversation is unavailable');
    }
    return {
      ref: anchor.publicRef,
      count: relatedConversations.length,
      relatedConversations,
    };
  }

  async resolveNavigation(userId: number, publicRef: string) {
    const link = await this.repository.findOne({
      where: { userId, publicRef, status: 'active' },
    });
    if (!link?.evidenceUnitId) throw new NotFoundException('Related conversation is unavailable');
    const unit = await resolveConversationEvidenceUnit(
      getNetworkConversationMemoryDir(String(userId)),
      link.evidenceUnitId,
    );
    if (!unit || unit.conversationId !== link.conversationId || unit.contentHash !== link.contentHash) {
      await this.repository.update({ id: link.id }, {
        status: unit ? 'stale' : 'invalidated',
        invalidatedReason: unit ? 'summary_changed' : 'conversation_unavailable',
      });
      throw new NotFoundException('Related conversation is unavailable');
    }
    const conversation = await this.conversations.findOne({
      where: { userId, id: link.conversationId },
    });
    if (!conversation) {
      await this.invalidateConversation(userId, link.conversationId);
      throw new NotFoundException('Related conversation is unavailable');
    }
    return { threadId: conversation.id };
  }

  private safeDate(value: string): Date | null {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
