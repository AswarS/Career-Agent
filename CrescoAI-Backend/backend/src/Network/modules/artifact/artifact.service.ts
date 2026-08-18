import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import {
  looksLikeServerPhysicalPath,
  sanitizeServerPhysicalPaths,
} from '../../utils/publicOutputSanitizer.js';
import { ArtifactEntity } from './entities/artifact.entity';

@Injectable()
export class ArtifactService {
  constructor(
    @InjectRepository(ArtifactEntity)
    private readonly artifactRepo: Repository<ArtifactEntity>,

    private readonly agentService: AgentService,
  ) {}

  async getArtifactById(id: number) {
    const artifact = await this.artifactRepo.findOne({
      where: { id: id },
    });
    if (!artifact) {
      throw new NotFoundException(`Artifact ${id} not found`);
    }
    return artifact;
  }

  async listArtifacts(userId: number) {
    const artifacts = await this.artifactRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return artifacts.map((artifact) => this.toPublicArtifact(artifact));
  }

  async toRenderablePublicArtifact(artifact: ArtifactEntity) {
    const publicArtifact = this.toPublicArtifact(artifact);
    if (artifact.renderMode !== 'html' || !artifact.storagePath) {
      return publicArtifact;
    }

    try {
      const html = await readFile(artifact.storagePath, 'utf8');
      return {
        ...publicArtifact,
        payload: { html, allowScripts: false },
      };
    } catch {
      throw new NotFoundException(`Artifact ${artifact.id} content not found`);
    }
  }

  toPublicArtifact(artifact: ArtifactEntity) {
    const {
      storagePath: _storagePath,
      metadataJson: _metadataJson,
      ...publicArtifact
    } = artifact;
    return {
      ...publicArtifact,
      title: publicArtifact.title
        ? sanitizeServerPhysicalPaths(publicArtifact.title)
        : publicArtifact.title,
      summary: publicArtifact.summary
        ? sanitizeServerPhysicalPaths(publicArtifact.summary)
        : publicArtifact.summary,
      payloadPath: publicArtifact.payloadPath && !looksLikeServerPhysicalPath(publicArtifact.payloadPath)
        ? publicArtifact.payloadPath
        : undefined,
      url: publicArtifact.url && !looksLikeServerPhysicalPath(publicArtifact.url)
        ? publicArtifact.url
        : undefined,
    };
  }

  async createArtifact(dto: {
    userId: number;
    conversationId?: string;
    messageId?: string;
    type: string;
    kind?: string;
    title: string;
    renderMode: string;
    payloadPath?: string;
    url?: string;
    storagePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
    summary?: string;
  }): Promise<ArtifactEntity> {
    const artifact = this.artifactRepo.create({
      userId: dto.userId,
      conversationId: dto.conversationId,
      messageId: dto.messageId,
      type: dto.type,
      kind: dto.kind,
      title: dto.title,
      status: 'ready',
      renderMode: dto.renderMode,
      payloadPath: dto.payloadPath,
      url: dto.url ?? dto.payloadPath,
      storagePath: dto.storagePath,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : undefined,
      summary: dto.summary,
      createdAt: new Date(),
    });
    return this.artifactRepo.save(artifact);
  }
}
