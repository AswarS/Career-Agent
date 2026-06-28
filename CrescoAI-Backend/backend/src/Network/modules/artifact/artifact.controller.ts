import { Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ArtifactService } from './artifact.service';

@Controller('api/career-agent/artifacts')
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get()
  listArtifacts(@Req() req: Request) {
    const currentUserId = req.userId;
    if (!currentUserId) {
      throw new ForbiddenException('Missing user identity');
    }
    return this.artifactService.listArtifacts(currentUserId);
  }

  @Get(':artifactId')
  async getById(@Req() req: Request, @Param('artifactId') artifactId: string) {
    const currentUserId = req.userId;
    if (!currentUserId) {
      throw new ForbiddenException('Missing user identity');
    }

    const id = Number(artifactId);
    if (!Number.isFinite(id)) {
      // If the param isn't numeric, treat it as a list-for-user request (backward compat)
      return this.artifactService.listArtifacts(currentUserId);
    }

    const artifact = await this.artifactService.getArtifactById(id);

    // Verify ownership
    if (artifact.userId !== currentUserId) {
      throw new ForbiddenException('You do not have access to this artifact');
    }

    return this.artifactService.toPublicArtifact(artifact);
  }

  @Post(':artifactId/refresh')
  async refreshArtifact(@Req() req: Request, @Param('artifactId') artifactId: string) {
    const currentUserId = req.userId;
    if (!currentUserId) {
      throw new ForbiddenException('Missing user identity');
    }

    const id = Number(artifactId);
    if (!Number.isFinite(id)) {
      return null;
    }

    const artifact = await this.artifactService.getArtifactById(id);

    if (artifact.userId !== currentUserId) {
      throw new ForbiddenException('You do not have access to this artifact');
    }

    // For now, just return the existing artifact (no dynamic refresh logic yet)
    return this.artifactService.toPublicArtifact(artifact);
  }
}
