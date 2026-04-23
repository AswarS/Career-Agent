import { Body, Controller, Get, Param } from '@nestjs/common';
import { ArtifactService } from './artifact.service';

@Controller('api/career-agent/artifacts')
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get(':id')
  getById(@Param('id') uid: number) {
    return this.artifactService.listArtifacts(uid);
  }
}
