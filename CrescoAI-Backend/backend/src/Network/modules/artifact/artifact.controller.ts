import { Controller, ForbiddenException, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ArtifactService } from './artifact.service';

@Controller('api/career-agent/artifacts')
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get(':id')
  getById(@Req() req: Request, @Param('id') uid: string) {
    const requestedUserId = Number(uid);
    const currentUserId = req.userId;
    if (!currentUserId) {
      throw new ForbiddenException('Missing user identity');
    }
    if (Number.isInteger(requestedUserId) && requestedUserId !== currentUserId) {
      throw new ForbiddenException('You do not have access to this user artifacts');
    }
    return this.artifactService.listArtifacts(currentUserId);
  }
}
