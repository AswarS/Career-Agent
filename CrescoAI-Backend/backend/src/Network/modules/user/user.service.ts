import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { DataSource, In, Repository } from 'typeorm';
import { ConversationEntity } from '../conversation/entities/conversation.entity';
import { MessageEntity } from '../conversation/entities/message.entity';
import { MemoryEntity } from '../memory/entities/memory.entity';
import { ApiSettingsEntity } from '../settings/entities/api-settings.entity';
import { ArtifactEntity } from '../artifact/entities/artifact.entity';
import { TeamEntity } from '../team/entities/team.entity';
import { UserEntity } from './entities/user.entity';
import { ResourceEntity } from '../resource/entities/resource.entity';
import { GeneratedAppEntity } from '../generated-app/entities/generated-app.entity';
import { enqueueAccountStatusChanged } from '../integration/account-publication';
import { BaseProfileEntity } from '../profile/entities/base-profile.entity';
import { ProfileStateEntity } from '../profile/entities/profile-state.entity';
import { ProfileMemoryItemEntity } from '../profile/entities/profile-memory-item.entity';
import { ProfileChangeProposalEntity } from '../profile/entities/profile-change-proposal.entity';
import { ProfileRevisionEntity } from '../profile/entities/profile-revision.entity';
import { ProfileProjectionJobEntity } from '../profile/entities/profile-projection-job.entity';
import { ProfileSuggestionEntity } from '../profile/entities/profile-suggestion.entity';
import { networkRootDir } from '../../utils/networkTranscriptStorage';
import { ProfileEvidenceLinkEntity } from '../profile/entities/profile-evidence-link.entity';
import { ProfileRefreshJobEntity } from '../profile/entities/profile-refresh-job.entity';
import { McpSettingEntity } from '../settings/entities/mcp-setting.entity';
import { GeneratedAppEventEntity } from '../generated-app/entities/generated-app-event.entity';
import { ConversationCleanupTaskEntity } from '../conversation/entities/conversation-cleanup-task.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async deleteUserCascade(targetUserIdentity: string, requesterUserId?: number, options?: { trainingRunId: string; preserveFiles?: boolean }) {
    if (!requesterUserId) {
      throw new ForbiddenException('Missing user identity');
    }

    const targetUser = await this.findUserByPublicOrLegacyId(targetUserIdentity);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }
    const targetUserId = targetUser.id;
    if (options && targetUser.username !== `training-${options.trainingRunId}`) {
      throw new ForbiddenException('Training cleanup ownership mismatch');
    }
    if (requesterUserId !== targetUserId) {
      throw new ForbiddenException('You can only delete your own account data');
    }

    const conversations = await this.conversationRepo.find({
      where: { userId: targetUserId },
      select: ['id'],
    });
    const conversationIds = conversations.map((c) => c.id);
    const occurredAt = new Date();
    const accountVersion = (targetUser.accountVersion ?? 0) + 1;

    // Keep the database owner until strict filesystem cleanup succeeds, so a failure can be retried.
    if (options && !options.preserveFiles) await this.cleanupUserFiles(targetUserId, true);

    await this.dataSource.transaction(async (manager) => {
      if (options) {
        for (const entity of [ProfileEvidenceLinkEntity, ProfileRefreshJobEntity, McpSettingEntity, GeneratedAppEventEntity, ConversationCleanupTaskEntity]) {
          await manager.delete(entity, { userId: targetUserId });
        }
      }
      if (!options) await enqueueAccountStatusChanged(
        manager,
        targetUser,
        'disabled',
        accountVersion,
        occurredAt,
      );
      if (conversationIds.length > 0) {
        await manager.delete(MessageEntity, { conversationId: In(conversationIds) });
      }
      await manager.delete(MessageEntity, { userId: targetUserId });
      await manager.delete(ConversationEntity, { userId: targetUserId });
      await manager.delete(MemoryEntity, { userId: targetUserId });
      await manager.delete(ApiSettingsEntity, { userId: targetUserId });
      await manager.delete(ArtifactEntity, { userId: targetUserId });
      await manager.delete(TeamEntity, { userId: targetUserId });
      await manager.delete(ResourceEntity, { userId: targetUserId });
      await manager.delete(GeneratedAppEntity, { userId: targetUserId });
      await manager.delete(ProfileProjectionJobEntity, { userId: targetUserId });
      await manager.delete(ProfileRevisionEntity, { userId: targetUserId });
      await manager.delete(ProfileChangeProposalEntity, { userId: targetUserId });
      await manager.delete(ProfileSuggestionEntity, { userId: targetUserId });
      await manager.delete(ProfileMemoryItemEntity, { userId: targetUserId });
      await manager.delete(ProfileStateEntity, { userId: targetUserId });
      await manager.delete(BaseProfileEntity, { userId: targetUserId });
      await manager.delete(UserEntity, { id: targetUserId });
    });

    if (!options) await this.cleanupUserFiles(targetUserId);

    return {
      success: true,
      userId: targetUser.publicUserId ?? String(targetUserId),
      publicUserId: targetUser.publicUserId ?? null,
      deletedConversations: conversationIds.length,
    };
  }

  private async findUserByPublicOrLegacyId(identity: string) {
    const byPublicId = await this.userRepo.findOne({
      where: { publicUserId: identity },
    });
    if (byPublicId) {
      return byPublicId;
    }

    const legacyId = Number(identity);
    if (!Number.isInteger(legacyId) || legacyId < 1) {
      return null;
    }
    return this.userRepo.findOne({ where: { id: legacyId } });
  }

  private async cleanupUserFiles(userId: number, strict = false) {
    const targets = [
      join(networkRootDir, 'user', String(userId)),
      join(networkRootDir, 'files', String(userId)),
    ];

    for (const target of targets) {
      try {
        await rm(target, { recursive: true, force: true });
      } catch (error) {
        if (strict) throw error;
        // best-effort cleanup
      }
    }
  }
}
