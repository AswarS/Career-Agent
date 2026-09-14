import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Public } from '../auth/public.decorator.js';
import { resolveGeneratedPath, resolveAppPath } from './generated.utils.js';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity.js';
import { APP_ID_PATTERN } from '../../../artifacts/webAppManifest.js';
import {
  GeneratedAppEventsService,
  validateAppEventBatch,
} from '../generated-app/generated-app-events.service.js';

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
    private readonly appEventsService: GeneratedAppEventsService,
  ) {}

  /**
   * Serve the app entry page (index.html).
   *
   * GET /api/career-agent/generated/:userId/app/:appId
   *
   * Declared before the single-file route: the app path shape also matches
   * ':userId/:kind/:filename' (kind='app'), which must not win for app URLs.
   */
  @Get(':userId/app/:appId')
  async serveAppIndex(
    @Param('userId') userId: string,
    @Param('appId') appId: string,
    @Res() res: any,
  ) {
    return this.serveAppPath(userId, appId, '', res);
  }

  /**
   * Serve a file inside a generated app directory. The wildcard is a named
   * parameter — Nest 11's router no longer supports the anonymous '*' form.
   *
   * GET /api/career-agent/generated/:userId/app/:appId/*path
   */
  @Get(':userId/app/:appId/*path')
  async serveApp(
    @Param('userId') userId: string,
    @Param('appId') appId: string,
    @Param('path') rest: string | string[],
    @Res() res: any,
  ) {
    // path-to-regexp v8 represents a named wildcard as an array of decoded
    // segments. Joining it is required for ordinary bundled app assets such
    // as assets/index.js; treating it as a scalar resolves only the first
    // directory and makes Vite/React apps render as a blank iframe.
    const relativePath = Array.isArray(rest) ? rest.join('/') : rest;
    return this.serveAppPath(userId, appId, relativePath ?? '', res);
  }

  private async serveAppPath(
    userId: string,
    appId: string,
    rest: string,
    res: any,
  ) {
    if (!userId) return res.status(400).json({ error: 'missing userId' });

    const internalUserId = await this.resolveInternalUserId(userId);
    if (!internalUserId) return res.status(404).json({ error: 'not found' });
    const result = resolveAppPath(userDataRootDir, internalUserId, appId, rest);
    if ('error' in result) return res.status(400).json({ error: result.error });
    if (!existsSync(result.path) || statSync(result.path).isDirectory()) {
      return res.status(404).json({ error: 'not found' });
    }

    return res.sendFile(result.path);
  }

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
   * Ingest an interaction event batch from a generated app.
   *
   * POST /api/career-agent/generated/:userId/app/:appId/events
   *
   * Same trust model as the GET routes: public endpoint, unguessable ids,
   * strict envelope validation, idempotent by (appId, sessionId, seq).
   */
  @Post(':userId/app/:appId/events')
  async ingestAppEvents(
    @Param('userId') userId: string,
    @Param('appId') appId: string,
    @Body() body: unknown,
    @Res() res: any,
  ) {
    if (!userId) return res.status(400).json({ error: 'missing userId' });
    if (!APP_ID_PATTERN.test(appId ?? '')) {
      return res.status(400).json({ error: 'invalid appId' });
    }

    const internalUserId = await this.resolveInternalUserId(userId);
    if (!internalUserId) return res.status(404).json({ error: 'not found' });
    // Resolve the app directory itself ('.') and require it to exist.
    const appDir = resolveAppPath(userDataRootDir, internalUserId, appId, '.');
    if ('error' in appDir) return res.status(400).json({ error: appDir.error });
    if (!existsSync(appDir.path) || !statSync(appDir.path).isDirectory()) {
      return res.status(404).json({ error: 'not found' });
    }

    const validation = validateAppEventBatch(body);
    if (validation.ok === false) {
      return res
        .status(400)
        .json({ error: validation.error, details: validation.issues });
    }
    const result = await this.appEventsService.ingest(
      Number(internalUserId),
      appId,
      validation.envelope,
    );
    return res.status(200).json({
      schema: 'app-event-ack/1.0',
      ok: true,
      received: result.received,
      duplicates: result.duplicates,
      server_time: new Date().toISOString(),
    });
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
