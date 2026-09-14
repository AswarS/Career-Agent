import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeneratedAppEntity } from './entities/generated-app.entity.js';

export type GeneratedAppUpsertInput = {
  userId: number;
  conversationId?: string;
  messageId?: string;
  artifactId: number;
  appId: string;
  appPath: string;
  appName: string;
  summary?: string;
  version: number;
  logicalObjectId?: string;
  previousGeneratedAppId?: number;
};

@Injectable()
export class GeneratedAppService {
  constructor(
    @InjectRepository(GeneratedAppEntity)
    private readonly repo: Repository<GeneratedAppEntity>,
  ) {}

  async upsertForArtifact(input: GeneratedAppUpsertInput): Promise<GeneratedAppEntity> {
    const existing = await this.repo.findOne({
      where: { userId: input.userId, appId: input.appId },
    });
    if (existing) {
      existing.artifactId = input.artifactId;
      existing.appPath = input.appPath;
      existing.appName = input.appName;
      if (input.summary !== undefined) existing.summary = input.summary;
      if (input.conversationId) existing.conversationId = input.conversationId;
      if (input.messageId) existing.messageId = input.messageId;
      existing.version = input.version;
      if (input.logicalObjectId) existing.logicalObjectId = input.logicalObjectId;
      if (input.previousGeneratedAppId)
        existing.previousGeneratedAppId = input.previousGeneratedAppId;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        appName: input.appName,
        appPath: input.appPath,
        summary: input.summary,
        appId: input.appId,
        artifactId: input.artifactId,
        version: input.version,
        logicalObjectId: input.logicalObjectId,
        previousGeneratedAppId: input.previousGeneratedAppId,
      }),
    );
  }

  /** Latest generated_apps row for a logical app, used to chain versions. */
  async findLatestByLogicalObjectId(
    userId: number,
    logicalObjectId: string,
  ): Promise<GeneratedAppEntity | null> {
    return this.repo.findOne({
      where: { userId, logicalObjectId },
      order: { version: 'DESC' },
    });
  }

  async listAppIdsForConversation(
    userId: number,
    conversationId: string,
  ): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId, conversationId },
      select: ['appId'],
    });
    return rows.map(row => row.appId).filter((id): id is string => Boolean(id));
  }

  async listRowsForConversation(
    userId: number,
    conversationId: string,
  ): Promise<GeneratedAppEntity[]> {
    return this.repo.find({ where: { userId, conversationId } });
  }

  /**
   * Current registry rows for every app owned by a user. Interaction replay is
   * user-scoped rather than conversation-scoped: a user may open an app from
   * Work and ask about the result in a fresh chat.
   */
  async listRowsForUser(userId: number): Promise<GeneratedAppEntity[]> {
    return this.repo.find({ where: { userId } });
  }
}
