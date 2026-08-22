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
    const parsed = artifacts.map((artifact) => ({ artifact, metadata: this.parseMetadata(artifact.metadataJson) }));
    const superseded = new Set(
      parsed.map(item => item.metadata?.previous_artifact_ref).filter((ref): ref is string => typeof ref === 'string')
        .map(ref => ref.startsWith('artifact://') ? ref.slice('artifact://'.length) : ref),
    );
    const latestByLogicalId = new Map<string, typeof parsed[number]>();
    for (const item of parsed) {
      const logicalId = item.metadata?.logical_object_id;
      if (typeof logicalId !== 'string') continue;
      const previous = latestByLogicalId.get(logicalId);
      if (!previous || Number(item.metadata?.version ?? 0) > Number(previous.metadata?.version ?? 0)) latestByLogicalId.set(logicalId, item);
    }
    return parsed
      .filter(item => {
        const uid = item.metadata?.artifact_uid;
        if (typeof uid === 'string' && superseded.has(uid)) return false;
        const logicalId = item.metadata?.logical_object_id;
        return typeof logicalId !== 'string' || latestByLogicalId.get(logicalId) === item;
      })
      .map(({ artifact }) => this.toPublicArtifact(artifact));
  }

  private parseMetadata(source?: string): Record<string, unknown> | undefined {
    if (!source) return undefined;
    try { const value = JSON.parse(source); return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined; } catch { return undefined; }
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
