import { Body, Controller, Delete, Get, Injectable, Module, Param, Post, UnauthorizedException, UseGuards, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { UserEntity } from '../user/entities/user.entity';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/user.service';
import { ProfileModule } from '../profile/profile.module';
import { ProfileService } from '../profile/profile.service';
import { hasProfileInputFields } from '../profile/profile.types';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { ConversationModule } from '../conversation/conversation.module';
import { ConversationService } from '../conversation/conversation.service';
import { AgentModule } from '../agent/agent.module';
import { AgentService } from '../agent/agent.service';
import { assertNetworkUserWorkspaceBinding, ensureNetworkUserWorkspaceDir } from '../../utils/networkTranscriptStorage.js';
import { realpath } from 'node:fs/promises';
import { HarnessCore } from './harness-core.js';
import type { TrainingInput } from './harness-core.js';

@Injectable()
class TrainingGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const token = process.env.CAREER_AGENT_TRAINING_TOKEN?.trim();
    const auth = context.switchToHttp().getRequest().headers.authorization;
    if (!token || typeof auth !== 'string') throw new UnauthorizedException('Training service credentials required');
    const actual = Buffer.from(auth); const expected = Buffer.from(`Bearer ${token}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException('Invalid training service credentials');
    return true;
  }
}

@Injectable()
class TrainingService {
  readonly core: HarnessCore;
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    profiles: ProfileService,
    settings: SettingsService,
    conversations: ConversationService,
    agents: AgentService,
    users: UserService,
  ) {
    // Credentials stay in this backend process, never in Gateway run responses.
    const resolveModel = (name: string) => {
      const models = JSON.parse(process.env.CAREER_AGENT_TRAINING_MODELS_JSON || '{}');
      const model = Object.hasOwn(models, name) ? models[name] : undefined;
      if (!model || !['openai', 'anthropic'].includes(model.provider)
        || typeof model.apiKey !== 'string' || !model.apiKey.trim()
        || typeof model.model !== 'string' || !model.model.trim()
        || typeof model.baseUrl !== 'string' || !/^https?:\/\//.test(model.baseUrl)) throw new Error('Unknown or invalid training model profile');
      return { provider: model.provider, apiKey: model.apiKey, model: model.model, baseUrl: model.baseUrl };
    };
    const allocatedWorkspaces = new Set<number>();
    this.core = new HarnessCore({
      validate: request => {
        if (request.gateway) {
          const route = request.gateway;
          const url = new URL(route.baseUrl);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
            || url.pathname !== `/sessions/${request.gatewaySessionId}` || !route.token?.trim() || !route.model?.trim()
            || !['openai', 'anthropic'].includes(route.provider)) throw new Error('Invalid Gateway session route');
        } else resolveModel(request.input.modelProfile);
        if (Object.keys(request.input.profile).length && !hasProfileInputFields(request.input.profile)) throw new Error('Profile must use supported backend Profile fields');
      },
      createUser: async runId => {
        const repo = db.getRepository(UserEntity);
        // No password, refresh token, registration event or external account publication.
        const user = await repo.save(repo.create({ publicUserId: randomUUID(), username: `training-${runId}`, displayName: 'Training User', profileJson: '{}' }));
        return user.id;
      },
      initializeProfile: async (userId, profile) => {
        if (Object.keys(profile).length) await profiles.updateProfile(userId, { profile });
      },
      configureModel: async (userId, name, request) => {
        const route = request.gateway;
        await settings.upsertSettings(userId, route ? { baseUrl: route.baseUrl, apiKey: route.token, provider: route.provider, model: route.model } : resolveModel(name));
      },
      workspace: async userId => {
        const root = await ensureNetworkUserWorkspaceDir(userId, { requireNewUserDirectory: true });
        allocatedWorkspaces.add(userId);
        return root;
      },
      createConversation: async (userId, taskId, request, workspaceRoot) => {
        const conversation = await conversations.createConversation({ title: `Training: ${taskId}` }, userId);
        agents.configureTrainingConversation(String(userId), conversation.id, request.gateway ? {
          runId: request.runId, gatewaySessionId: request.gatewaySessionId, rootConversationId: conversation.id,
          baseUrl: request.gateway.baseUrl, token: request.gateway.token,
        } : undefined, workspaceRoot);
        return conversation.id;
      },
      execute: async function* (binding, query, signal) {
        signal.throwIfAborted();
        const root = await ensureNetworkUserWorkspaceDir(binding.userId);
        assertNetworkUserWorkspaceBinding(binding.userId, binding.workspaceRoot, await realpath(root));
        for await (const event of conversations.sendMessageStream(binding.conversationId, { content: query }, binding.userId, signal)) yield { ...event };
      },
      dispose: async (userId, conversationId) => {
        if (conversationId) await agents.disposeConversationRuntime(String(userId), conversationId);
      },
      respond: async (binding, toolUseId, answers) => {
        await conversations.respondToInteractiveTool(binding.conversationId, toolUseId, { approved: true, answers }, binding.userId);
      },
      cleanup: async (userId, runId) => {
        await users.deleteUserCascade(String(userId), userId, { trainingRunId: runId, preserveFiles: !allocatedWorkspaces.has(userId) });
        allocatedWorkspaces.delete(userId);
      },
    });
  }
  onModuleDestroy() { return this.core.shutdown(); }
  async readiness() {
    try {
      await this.db.query('SELECT 1');
      return { implementation: 'career-agent-nestjs', protocolVersion: 1, databaseReachable: true };
    } catch {
      return { implementation: 'career-agent-nestjs', protocolVersion: 1, databaseReachable: false };
    }
  }
}

// Public bypasses user JWT only; the separate service guard is mandatory, even in SKIP_AUTH mode.
@Public()
@UseGuards(TrainingGuard)
@Controller('api/career-agent/training/runs')
class TrainingController {
  constructor(private readonly service: TrainingService) {}
  @Get('readiness')
  readiness() { return this.service.readiness(); }
  @Post()
  prepare(@Body() body: unknown) {
    try { return this.service.core.prepare(body as TrainingInput); }
    catch { throw new BadRequestException('Invalid training task, model profile, or conflicting run ID'); }
  }
  @Get(':id')
  get(@Param('id') id: string) {
    try { return this.service.core.get(id); } catch { throw new NotFoundException('Training run not found'); }
  }
  @Post(':id/start')
  start(@Param('id') id: string) {
    this.get(id);
    try { return this.service.core.start(id); } catch { throw new ConflictException('Training run is not ready'); }
  }
  @Post(':id/cancel')
  cancel(@Param('id') id: string) { this.get(id); return this.service.core.cancel(id); }
  @Post(':id/user-questions/:toolUseId/respond')
  async respond(@Param('id') id: string, @Param('toolUseId') toolUseId: string, @Body() body: { answers?: unknown }) {
    this.get(id);
    try { return await this.service.core.respond(id, toolUseId, body?.answers); }
    catch { throw new ConflictException('Question is not waiting, answers are invalid, or delivery failed'); }
  }
  @Delete(':id')
  cleanup(@Param('id') id: string) { this.get(id); return this.service.core.cleanup(id); }
}

@Module({
  imports: [UserModule, ProfileModule, SettingsModule, ConversationModule, AgentModule],
  controllers: [TrainingController],
  providers: [TrainingGuard, TrainingService],
})
export class TrainingHarnessModule {}
