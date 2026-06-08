import { ForbiddenException, Injectable } from '@nestjs/common';
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

@Injectable()
export class UserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
  ) {}

  async deleteUserCascade(targetUserId: number, requesterUserId?: number) {
    if (!requesterUserId) {
      throw new ForbiddenException('Missing user identity');
    }
    if (requesterUserId !== targetUserId) {
      throw new ForbiddenException('You can only delete your own account data');
    }

    const conversations = await this.conversationRepo.find({
      where: { userId: targetUserId },
      select: ['id'],
    });
    const conversationIds = conversations.map((c) => c.id);

    await this.dataSource.transaction(async (manager) => {
      if (conversationIds.length > 0) {
        await manager.delete(MessageEntity, { conversationId: In(conversationIds) });
      }
      await manager.delete(ConversationEntity, { userId: targetUserId });
      await manager.delete(MemoryEntity, { userId: targetUserId });
      await manager.delete(ApiSettingsEntity, { userId: targetUserId });
      await manager.delete(ArtifactEntity, { userId: targetUserId });
      await manager.delete(TeamEntity, { userId: targetUserId });
      await manager.delete(ResourceEntity, { userId: targetUserId });
      await manager.delete(GeneratedAppEntity, { userId: targetUserId });
      await manager.delete(UserEntity, { id: targetUserId });
    });

    await this.cleanupUserFiles(targetUserId);

    return {
      success: true,
      userId: targetUserId,
      deletedConversations: conversationIds.length,
    };
  }

  private async cleanupUserFiles(userId: number) {
    const networkRoot = join(process.cwd(), 'src', 'Network');
    const targets = [
      join(networkRoot, 'user', String(userId)),
      join(networkRoot, 'files', String(userId)),
    ];

    for (const target of targets) {
      try {
        await rm(target, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}
