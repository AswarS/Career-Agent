import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ProfileEvidenceService } from '../profile/profile-evidence.service';
import { profileFeatureFlags } from '../profile/profile-feature-flags';
import { profileAccessDenied } from '../profile/profile.errors';
import { ProfileRefreshService } from './profile-refresh.service';

@Controller('api/career-agent/profile')
export class ProfileRefreshController {
  constructor(
    private readonly refresh: ProfileRefreshService,
    private readonly evidence: ProfileEvidenceService,
  ) {}

  @Post('refresh-jobs')
  @HttpCode(202)
  create(@Req() req: Request, @Body() body: { clientRequestId?: string }) {
    if (!profileFeatureFlags.refreshJobs() || !profileFeatureFlags.refreshAgent()) {
      throw profileAccessDenied('Profile refresh is disabled');
    }
    return this.refresh.create(req.userId!, body?.clientRequestId);
  }

  @Get('refresh-jobs/current')
  current(@Req() req: Request) {
    if (!profileFeatureFlags.refreshJobs()) throw profileAccessDenied('Profile refresh is disabled');
    return this.refresh.current(req.userId!);
  }

  @Get('refresh-jobs/:jobId')
  get(@Req() req: Request, @Param('jobId') jobId: string) {
    if (!profileFeatureFlags.refreshJobs()) throw profileAccessDenied('Profile refresh is disabled');
    return this.refresh.get(req.userId!, jobId);
  }

  @Get('evidence/:evidenceRef')
  resolveEvidence(@Req() req: Request, @Param('evidenceRef') evidenceRef: string) {
    if (!profileFeatureFlags.evidenceLinks()) throw profileAccessDenied('Profile evidence is disabled');
    return this.evidence.resolvePublic(req.userId!, evidenceRef);
  }

  @Get('evidence/:evidenceRef/navigation')
  resolveEvidenceNavigation(@Req() req: Request, @Param('evidenceRef') evidenceRef: string) {
    if (!profileFeatureFlags.evidenceLinks()) throw profileAccessDenied('Profile evidence is disabled');
    return this.evidence.resolveNavigation(req.userId!, evidenceRef);
  }
}
