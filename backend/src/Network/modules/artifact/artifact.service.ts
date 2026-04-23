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

  async listArtifacts(uid: number) {
    return this.artifactRepo.find({
      where: { uid: uid },
      order: { createdAt: 'ASC' },
    });
  }
}
