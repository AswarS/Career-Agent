import { Controller, Get, Param, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Public } from '../auth/public.decorator.js';
import { resolveGeneratedPath, resolveAppPath } from './generated.utils.js';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity.js';

// Re-export so consumers can import the pure helpers from the controller path if needed.
export { resolveGeneratedPath, resolveAppPath };

const networkRootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const userDataRootDir = join(networkRootDir, 'user');

@Public()
@Controller('api/career-agent/generated')
export class GeneratedController {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /**
   * Serve a single generated file (image / audio / video / html).
   *
   * GET /api/career-agent/generated/:userId/:kind/:filename
   *
   * Public endpoint — userId is embedded in the URL path for isolation.
   * Filenames are opaque timestamps, making URLs unguessable.
   */
  @Get(':userId/:kind/:filename')
  async serveFile(
    @Param('userId') userId: string,
    @Param('kind') kind: string,
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    if (!userId) return res.status(400).json({ error: 'missing userId' });

    const internalUserId = await this.resolveInternalUserId(userId);
    if (!internalUserId) return res.status(404).json({ error: 'not found' });
    const result = resolveGeneratedPath(userDataRootDir, internalUserId, kind, filename);
    if ('error' in result) return res.status(400).json({ error: result.error });
    if (!existsSync(result.path)) return res.status(404).json({ error: 'not found' });

    return res.sendFile(result.path);
  }

  /**
   * Serve files from a generated app directory.
   *
   * GET /api/career-agent/generated/:userId/app/:appId/*
   */
  @Get(':userId/app/:appId/*')
  async serveApp(
    @Param('userId') userId: string,
    @Param('appId') appId: string,
    @Param('0') rest: string,
    @Res() res: any,
  ) {
    if (!userId) return res.status(400).json({ error: 'missing userId' });

    const internalUserId = await this.resolveInternalUserId(userId);
    if (!internalUserId) return res.status(404).json({ error: 'not found' });
    const result = resolveAppPath(userDataRootDir, internalUserId, appId, rest ?? '');
    if ('error' in result) return res.status(400).json({ error: result.error });
    if (!existsSync(result.path) || statSync(result.path).isDirectory()) {
      return res.status(404).json({ error: 'not found' });
    }

    return res.sendFile(result.path);
  }

  private async resolveInternalUserId(publicOrLegacyUserId: string) {
    const publicUser = await this.userRepo.findOne({
      where: { publicUserId: publicOrLegacyUserId },
      select: ['id'],
    });
    if (publicUser) {
      return String(publicUser.id);
    }

    // Keep already-issued numeric URLs working during the transition.
    const legacyId = Number(publicOrLegacyUserId);
    if (!Number.isInteger(legacyId) || legacyId < 1) {
      return null;
    }
    const legacyUser = await this.userRepo.findOne({
      where: { id: legacyId },
      select: ['id'],
    });
    return legacyUser ? String(legacyUser.id) : null;
  }
}
