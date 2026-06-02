import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ArtifactService } from './artifact.service';

@Controller('api/career-agent/artifacts')
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.artifactService.listArtifacts(Number(request.user!.id));
  }

  @Get(':id')
  getById(@Param('id') artifactId: string, @Req() request: AuthenticatedRequest) {
    return this.artifactService.getArtifactById(
      artifactId,
      Number(request.user!.id),
    );
  }

  @Post(':id/refresh')
  refresh(@Param('id') artifactId: string, @Req() request: AuthenticatedRequest) {
    return this.artifactService.refreshArtifact(
      artifactId,
      Number(request.user!.id),
    );
  }

  @Post(':id/interactions')
  interact(
    @Param('id') artifactId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.artifactService.recordInteraction(
      artifactId,
      Number(request.user!.id),
      body,
    );
  }
}
