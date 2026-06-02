import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ArtifactEntity } from './entities/artifact.entity';

@Injectable()
export class ArtifactService {
  constructor(
    @InjectRepository(ArtifactEntity)
    private readonly artifactRepo: Repository<ArtifactEntity>,
  ) {}

  async getArtifactById(id: string, userId: number) {
    const numericId = this.parseArtifactId(id);
    const artifact = await this.artifactRepo.findOne({
      where: { id: numericId, uid: userId },
    });
    if (!artifact) {
      throw this.artifactNotFound(id);
    }
    return this.toArtifactRecord(artifact);
  }

  async listArtifacts(uid: number) {
    const artifacts = await this.artifactRepo.find({
      where: { uid: uid },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return Promise.all(artifacts.map((artifact) => this.toArtifactRecord(artifact)));
  }

  async refreshArtifact(id: string, userId: number) {
    const numericId = this.parseArtifactId(id);
    const artifact = await this.artifactRepo.findOne({
      where: { id: numericId, uid: userId },
    });

    if (!artifact) {
      throw this.artifactNotFound(id);
    }

    artifact.revision = (artifact.revision ?? 1) + 1;
    artifact.status = 'ready';
    const saved = await this.artifactRepo.save(artifact);
    return this.toArtifactRecord(saved);
  }

  async recordInteraction(
    id: string,
    userId: number,
    _payload: Record<string, unknown>,
  ) {
    await this.getArtifactById(id, userId);
    const eventId = `event-${randomUUID()}`;
    const receivedAt = new Date().toISOString();
    return {
      accepted: true,
      event_id: eventId,
      eventId,
      artifact_id: id,
      artifactId: id,
      received_at: receivedAt,
      receivedAt,
    };
  }

  private parseArtifactId(id: string) {
    const value = id.startsWith('artifact-') ? id.slice('artifact-'.length) : id;
    const numericId = Number(value);
    if (!Number.isInteger(numericId)) {
      throw this.artifactNotFound(id);
    }

    return numericId;
  }

  private async toArtifactRecord(artifact: ArtifactEntity) {
    const updatedAt = (artifact.updatedAt ?? artifact.createdAt ?? new Date()).toISOString();
    const payload = await this.resolvePayload(artifact);

    return {
      id: String(artifact.id),
      type: artifact.type ?? 'custom',
      title: artifact.title ?? 'Untitled Artifact',
      status: artifact.status ?? 'ready',
      render_mode: artifact.renderMode ?? 'markdown',
      renderMode: artifact.renderMode ?? 'markdown',
      revision: artifact.revision ?? 1,
      updated_at: updatedAt,
      updatedAt,
      summary: artifact.summary ?? '',
      payload,
    };
  }

  private async resolvePayload(artifact: ArtifactEntity) {
    if (artifact.payloadJson) {
      return this.parsePayload(artifact.payloadJson);
    }

    if (!artifact.payloadPath) {
      return {};
    }

    try {
      const raw = await readFile(artifact.payloadPath, 'utf8');
      return this.parsePayload(raw);
    } catch {
      return {
        path: artifact.payloadPath,
      };
    }
  }

  private parsePayload(raw: string) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return {
        markdown: raw,
      };
    }
  }

  private artifactNotFound(id: string) {
    return new NotFoundException({
      code: 'ARTIFACT_NOT_FOUND',
      message: `Artifact ${id} not found`,
    });
  }
}
