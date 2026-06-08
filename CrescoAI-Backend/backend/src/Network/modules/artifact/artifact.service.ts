import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentService } from '../agent/agent.service';
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
    return this.artifactRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async createArtifact(dto: {
    userId: number;
    type: string;
    title: string;
    renderMode: string;
    payloadPath?: string;
    summary?: string;
  }): Promise<ArtifactEntity> {
    const artifact = this.artifactRepo.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      status: 'ready',
      renderMode: dto.renderMode,
      payloadPath: dto.payloadPath,
      summary: dto.summary,
      createdAt: new Date(),
    });
    return this.artifactRepo.save(artifact);
  }
}
