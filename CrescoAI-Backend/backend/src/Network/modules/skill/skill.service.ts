import {
  ForbiddenException,
  Injectable,
  NotImplementedException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  SkillRegistry,
  type SkillHandlerResult,
  type SkillExecutionContext,
  type SkillEntry,
} from './skill.registry';
import { registerBuiltinSkills } from './built-in-skills';
import { SettingsService } from '../settings/settings.service';
import { AgentService } from '../agent/agent.service';
import {
  listUserSkills,
  listAllUserSkills,
  listExternalSkills,
  readSkillFile,
  readSkillFileByPath,
  writeSkillFile,
  deleteSkillFile,
  type ParsedSkillFile,
} from './skill-file-store';
import { substituteArguments } from '../../../utils/argumentSubstitution.js';
import { skillLogger } from '../../utils/skillLogger.js';
import { getBundledSkills } from '../../../skills/bundledSkills.js';
import {
  getGlobalDiskSkillCatalog,
  type GlobalDiskSkillCatalogEntry,
} from '../../../skills/bundled/careerAgent.js';

export const USER_DEFINED_SKILLS_ENABLED = false;

@Injectable()
export class SkillService implements OnModuleInit {
  constructor(
    public readonly registry: SkillRegistry,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly agentService?: AgentService,
    @Optional() private readonly profileService?: ProfileService,
  ) {}

  async onModuleInit() {
    registerBuiltinSkills((entry) => {
      this.registry.register(entry);
    });
    if (USER_DEFINED_SKILLS_ENABLED) {
      await this.loadCustomSkillsFromDisk();
    }
    const loadedSkills = await this.listSkills();
    console.log(
      '[SkillService] Skills loaded:',
      loadedSkills.map((skill) => skill.name).join(', '),
    );
  }

  async listSkills(
    userId?: number,
    category?: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (USER_DEFINED_SKILLS_ENABLED && userId) {
      await this.syncUserSkills(userId);
    }

    const registryUserId = USER_DEFINED_SKILLS_ENABLED ? userId : undefined;

    const loadedSkills = category
      ? this.registry.getByCategory(category as SkillEntry['category'], registryUserId)
      : this.registry.getAll(registryUserId);

    const result = loadedSkills.map((entry) => ({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      parameters:
        entry.source === 'builtin'
          ? entry.parameters
          : this.argumentNamesToParameters(entry.argumentNames),
      requiresLlm: entry.requiresLlm,
      status: entry.status,
      source: entry.source,
      arguments: entry.argumentNames ?? [],
    }));

    const registeredNames = new Set(result.map((entry) => entry.name));
    const globalDiskSkills = getGlobalDiskSkillCatalog()
      .filter((entry) => !category || entry.category === category)
      .filter((entry) => !registeredNames.has(entry.name))
      .map((entry) => this.globalDiskSkillListItem(entry));

    return [...result, ...globalDiskSkills];
  }

  async getSkillDetail(
    name: string,
    userId?: number,
  ): Promise<Record<string, unknown> | null> {
    if (USER_DEFINED_SKILLS_ENABLED && userId) {
      await this.syncUserSkills(userId);
    }

    const entry = this.registry.get(
      name,
      USER_DEFINED_SKILLS_ENABLED ? userId : undefined,
    );
    if (!entry) {
      const globalSkill = this.findGlobalDiskSkillEntry(name);
      return globalSkill ? this.globalDiskSkillListItem(globalSkill) : null;
    }

    return {
      name: entry.name,
      description: entry.description,
      category: entry.category,
      parameters:
        entry.source === 'builtin'
          ? entry.parameters
          : this.argumentNamesToParameters(entry.argumentNames),
      arguments: entry.argumentNames ?? [],
      requiresLlm: entry.requiresLlm,
      status: entry.status,
      source: entry.source,
    };
  }

  async createCustomSkill(
    userId: number,
    name: string,
    description: string,
    content: string,
    category: string = 'utility',
    argNames?: string,
  ): Promise<{ name: string; filePath: string }> {
    if (!USER_DEFINED_SKILLS_ENABLED) {
      throw new NotImplementedException({
        error: 'USER_DEFINED_SKILLS_DISABLED',
        message: 'User-defined skills are not supported yet.',
      });
    }

    const normalizedName = name.trim().toLowerCase().replace(/[\s_]+/g, '-');

    if (this.registry.get(normalizedName)) {
      throw new ForbiddenException(
        `Cannot override built-in skill: ${normalizedName}`,
      );
    }

    const fm: Record<string, unknown> = {
      description,
      'user-invocable': true,
      category,
    };
    if (argNames) fm.arguments = argNames;

    const filePath = await writeSkillFile(
      userId,
      normalizedName,
      fm,
      content,
    );
    const savedSkill = await readSkillFile(userId, normalizedName);
    if (savedSkill) {
      this.registerCustomSkill(userId, savedSkill);
    }

    return { name: normalizedName, filePath };
  }

  async updateCustomSkill(
    userId: number,
    name: string,
    updates: {
      description?: string;
      content?: string;
      category?: string;
      argNames?: string;
    },
  ): Promise<boolean> {
    if (!USER_DEFINED_SKILLS_ENABLED) {
      throw new NotImplementedException({
        error: 'USER_DEFINED_SKILLS_DISABLED',
        message: 'User-defined skills are not supported yet.',
      });
    }

    const existing = await readSkillFile(userId, name);
    if (!existing) return false;

    const fm: Record<string, unknown> = {
      description: updates.description ?? existing.description,
      'user-invocable': true,
      category: updates.category ?? existing.category,
    };
    if (updates.argNames !== undefined) fm.arguments = updates.argNames;
    else if (existing.argumentNames.length > 0)
      fm.arguments = existing.argumentNames.join(' ');

    await writeSkillFile(userId, name, fm, updates.content ?? existing.content);
    const savedSkill = await readSkillFile(userId, name);
    if (savedSkill) {
      this.registerCustomSkill(userId, savedSkill);
    }
    return true;
  }

  async deleteCustomSkill(userId: number, name: string): Promise<boolean> {
    if (!USER_DEFINED_SKILLS_ENABLED) {
      throw new NotImplementedException({
        error: 'USER_DEFINED_SKILLS_DISABLED',
        message: 'User-defined skills are not supported yet.',
      });
    }

    const deleted = await deleteSkillFile(userId, name);
    if (deleted) {
      this.registry.unregisterCustom(userId, name);
    }
    return deleted;
  }

  async buildExecutionContext(
    userId?: number,
    conversationId?: string,
  ): Promise<SkillExecutionContext> {
    const context: SkillExecutionContext = { userId, conversationId };

    if (this.settingsService && userId) {
      const saved = await this.settingsService.getApiSettings(userId);
      if (saved) {
        context.llmConfig = {
          apiKey: saved.apiKey ?? undefined,
          baseUrl: saved.baseUrl ?? undefined,
          model: saved.model ?? undefined,
        };
      }
    }

    return context;
  }

  async invokeSkillThroughCc(
    name: string,
    args: string,
    context: SkillExecutionContext,
  ): Promise<SkillHandlerResult> {
    if (!this.agentService) {
      return {
        success: false,
        reply: 'Skill execution is unavailable because AgentService is missing.',
      };
    }

    const resolvedName = this.resolveCcSkillName(name, context.userId);
    if (!resolvedName) {
      throw new ForbiddenException({
        error: 'Skill not loaded',
        skill: name,
      });
    }

    const executionContext = await this.buildExecutionContext(
      context.userId,
      context.conversationId,
    );
    const prompt = `/${resolvedName}${args.trim() ? ` ${args.trim()}` : ''}`;
    const result = await this.agentService.runIsolatedPrompt({
      userId: String(context.userId ?? 1),
      conversationId: context.conversationId,
      apiKey: executionContext.llmConfig?.apiKey,
      baseUrl: executionContext.llmConfig?.baseUrl,
      model: executionContext.llmConfig?.model,
      content: prompt,
      abortSignal: context.abortSignal,
      onProgress: context.onProgress,
    });

    return {
      success: result.success,
      reply: result.reply ?? 'Skill execution failed: empty CC result.',
      outputFiles: result.generatedFiles,
      metadata: result.model ? { model: result.model } : undefined,
    };
  }

  async invokeSkill(
    name: string,
    args: string,
    context?: SkillExecutionContext,
  ): Promise<SkillHandlerResult> {
    const invocationStartedAt = Date.now();
    const mergedContext: SkillExecutionContext = { ...(context ?? {}) };
    if (USER_DEFINED_SKILLS_ENABLED && mergedContext.userId) {
      await this.syncUserSkills(mergedContext.userId);
    }
    if (!mergedContext.llmConfig && mergedContext.userId && this.settingsService) {
      const saved = await this.settingsService.getApiSettings(mergedContext.userId);
      if (saved) {
        mergedContext.llmConfig = {
          apiKey: saved.apiKey ?? undefined,
          baseUrl: saved.baseUrl ?? undefined,
          model: saved.model ?? undefined,
        };
      }
    }
    if (this.agentService) {
      mergedContext.runUnifiedPrompt = async (input) =>
        this.agentService!.runIsolatedPrompt({
          userId: String(input.userId ?? mergedContext.userId ?? 1),
          conversationId: input.conversationId ?? mergedContext.conversationId,
          apiKey: input.apiKey ?? mergedContext.llmConfig?.apiKey,
          baseUrl: input.baseUrl ?? mergedContext.llmConfig?.baseUrl,
          model: input.model ?? mergedContext.llmConfig?.model,
          content: input.content,
          abortSignal: mergedContext.abortSignal,
          onProgress: mergedContext.onProgress,
        });
      mergedContext.runInSession = async (callback) =>
        this.agentService!.runInSessionContext({
          userId: String(mergedContext.userId ?? 1),
          conversationId: mergedContext.conversationId,
          callback: async (sessionContext) => {
            const abortSession = () => sessionContext.abortController.abort();
            if (mergedContext.abortSignal?.aborted) {
              abortSession();
            } else {
              mergedContext.abortSignal?.addEventListener('abort', abortSession, { once: true });
            }
            try {
              return await callback({ abortController: sessionContext.abortController });
            } finally {
              mergedContext.abortSignal?.removeEventListener('abort', abortSession);
            }
          },
        });
    }

    const entry = this.registry.get(name, mergedContext.userId);
    if (!entry) {
      skillLogger.warn('SkillService', 'Skill invocation rejected', {
        name,
        userId: mergedContext.userId ?? null,
        conversationId: mergedContext.conversationId ?? null,
        reason: 'skill_not_loaded',
      });
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    console.log(
      `[SkillService] invokeSkill source=${entry.source} name=${name} userId=${mergedContext.userId ?? 'unknown'} conversationId=${mergedContext.conversationId ?? 'unknown'}`,
    );

    if (entry.status !== 'loaded') {
      skillLogger.warn('SkillService', 'Skill invocation rejected', {
        source: entry.source,
        name,
        userId: mergedContext.userId ?? null,
        conversationId: mergedContext.conversationId ?? null,
        reason: `status_${entry.status}`,
      });
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    const invocationLogContext = {
      source: entry.source,
      name,
      userId: mergedContext.userId ?? null,
      conversationId: mergedContext.conversationId ?? null,
    };
    const finishInvocation = async (
      result: SkillHandlerResult,
    ): Promise<SkillHandlerResult> => {
      skillLogger.info('SkillService', 'Skill invocation completed', {
        ...invocationLogContext,
        durationMs: Date.now() - invocationStartedAt,
        success: result.success,
        replyLength: result.reply.length,
        outputFileCount: result.outputFiles?.length ?? 0,
        artifactCount: result.artifacts?.length ?? 0,
      });
      await this.saveProfileSuggestionsFromSkillResult(
        result,
        mergedContext.userId,
        typeof mergedContext.conversationId === 'string'
          ? mergedContext.conversationId
          : null,
      );
      return result;
    };
    skillLogger.info('SkillService', 'Skill invocation started', {
      ...invocationLogContext,
      argsLength: args.length,
      hasAbortSignal: Boolean(mergedContext.abortSignal),
      hasProgressCallback: Boolean(mergedContext.onProgress),
      hasLlmConfig: Boolean(
        mergedContext.llmConfig?.apiKey && mergedContext.llmConfig?.baseUrl,
      ),
    });

    if (entry.source === 'builtin') {
      try {
        return await finishInvocation(await entry.handler(args, mergedContext));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        skillLogger.error('SkillService', 'Skill invocation threw', {
          ...invocationLogContext,
          durationMs: Date.now() - invocationStartedAt,
          error: this.sanitizeLogMessage(message),
        });
        return await finishInvocation({
          success: false,
          reply: `Skill execution failed: ${message}`,
        });
      }
    }

    if (!mergedContext.userId) {
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    const custom = entry.filePath
      ? await readSkillFileByPath(entry.filePath)
      : await readSkillFile(mergedContext.userId, name);
    if (!custom) {
      this.registry.setStatus(name, 'unloaded', mergedContext.userId);
      skillLogger.warn('SkillService', 'Skill invocation rejected', {
        ...invocationLogContext,
        durationMs: Date.now() - invocationStartedAt,
        reason: 'custom_skill_file_missing',
      });
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    return await finishInvocation(
      await this.invokeCustomSkill(custom, args, mergedContext),
    );
  }

  private async saveProfileSuggestionsFromSkillResult(
    result: SkillHandlerResult,
    userId: number | undefined,
    sourceThreadId: string | null,
  ) {
    if (!userId || !this.profileService) {
      return;
    }

    try {
      await this.profileService.saveSuggestionsFromOutput({
        userId,
        sourceThreadId,
        output: {
          reply: result.reply,
          metadata: result.metadata,
        },
      });
    } catch (error: unknown) {
      skillLogger.warn('SkillService', 'Profile suggestion extraction failed', {
        userId,
        conversationId: sourceThreadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async invokeCustomSkill(
    skill: ParsedSkillFile,
    args: string,
    context: SkillExecutionContext,
  ): Promise<SkillHandlerResult> {
    const llmConfig = context?.llmConfig;
    if (!llmConfig?.apiKey || !llmConfig?.baseUrl) {
      return {
        success: false,
        reply: 'This skill requires LLM configuration. Please set your API key first.',
      };
    }

    const skillPrompt = await this.buildCustomSkillPrompt(skill);
    const expanded = substituteArguments(
      skillPrompt,
      args,
      true,
      skill.argumentNames,
    );

    try {
      if (!context.runUnifiedPrompt) {
        return {
          success: false,
          reply: 'Skill backend is not ready: AgentService unavailable.',
        };
      }

      const result = await context.runUnifiedPrompt({
        userId: context.userId ?? 1,
        conversationId:
          typeof context.conversationId === 'string'
            ? context.conversationId
            : undefined,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        content: `${expanded}\n\nUser request:\n${args || 'Please execute.'}`,
      });

      if (!result.success || !result.reply) {
        return {
          success: false,
          reply: 'Skill execution failed: empty result from unified query engine.',
        };
      }

      return {
        success: true,
        reply: result.reply,
        outputFiles: result.generatedFiles,
        metadata: {
          model: result.model ?? llmConfig.model,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, reply: `Skill execution failed: ${message}` };
    }
  }

  async skillExists(name: string, userId?: number): Promise<boolean> {
    if (USER_DEFINED_SKILLS_ENABLED && userId) {
      await this.syncUserSkills(userId);
    }
    return this.resolveCcSkillName(name, userId) !== null;
  }

  parseSkillInvocation(
    content: string,
  ): { skillName: string; args: string } | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('/')) return null;

    const withoutSlash = trimmed.slice(1);
    const spaceIndex = withoutSlash.indexOf(' ');

    if (spaceIndex === -1) {
      const skillName = withoutSlash.toLowerCase();
      return skillName ? { skillName, args: '' } : null;
    }

    return {
      skillName: withoutSlash.slice(0, spaceIndex).toLowerCase(),
      args: withoutSlash.slice(spaceIndex + 1).trim(),
    };
  }

  async isSkillCommand(content: string, userId?: number): Promise<boolean> {
    const parsed = this.parseSkillInvocation(content);
    if (!parsed) return false;
    if (parsed.skillName === 'skills') return true;
    if (USER_DEFINED_SKILLS_ENABLED && userId) {
      await this.syncUserSkills(userId);
    }
    return this.resolveCcSkillName(parsed.skillName, userId) !== null;
  }

  private resolveCcSkillName(name: string, userId?: number): string | null {
    const requestedName = name.trim().toLowerCase();
    if (!requestedName) return null;

    const legacyHyphenName = requestedName.replace(/[\s_]+/g, '-');
    const underscoreName = requestedName.replace(/[\s-]+/g, '_');
    const bundledSkills = getBundledSkills();
    const bundled =
      bundledSkills.find((skill) => skill.name === requestedName) ??
      bundledSkills.find((skill) => skill.name === legacyHyphenName) ??
      bundledSkills.find((skill) => skill.name === underscoreName);
    if (bundled) return bundled.name;

    const registryUserId = USER_DEFINED_SKILLS_ENABLED ? userId : undefined;
    const registryEntry =
      this.registry.get(requestedName, registryUserId) ??
      this.registry.get(legacyHyphenName, registryUserId);
    return registryEntry?.name ?? null;
  }

  private findGlobalDiskSkillEntry(
    name: string,
  ): GlobalDiskSkillCatalogEntry | undefined {
    const requestedName = name.trim().toLowerCase();
    const underscoreName = requestedName.replace(/-/g, '_');
    return getGlobalDiskSkillCatalog().find(
      (entry) =>
        entry.name === requestedName || entry.name === underscoreName,
    );
  }

  private globalDiskSkillListItem(entry: GlobalDiskSkillCatalogEntry) {
    return {
      name: entry.name,
      description: entry.description,
      category: entry.category,
      parameters: this.argumentNamesToParameters(entry.argumentNames),
      requiresLlm: true,
      status: 'loaded' as const,
      source: 'bundled',
      arguments: entry.argumentNames,
    };
  }

  private async loadCustomSkillsFromDisk(): Promise<void> {
    const allSkills = await listAllUserSkills();
    for (const { userId, skill } of allSkills) {
      this.registerCustomSkill(userId, skill);
    }
  }

  private async syncUserSkills(userId: number): Promise<void> {
    const diskSkills = await listUserSkills(userId);
    const externalSkills = await listExternalSkills();
    const diskNames = new Set(
      [...diskSkills, ...externalSkills].map((skill) =>
        this.normalizeSkillName(skill.name),
      ),
    );

    for (const skill of externalSkills) {
      this.registerCustomSkill(userId, skill);
    }
    for (const skill of diskSkills) {
      this.registerCustomSkill(userId, skill);
    }

    for (const entry of this.registry.getCustomForUser(userId)) {
      if (!diskNames.has(entry.name)) {
        this.registry.unregisterCustom(userId, entry.name);
      }
    }
  }

  private sanitizeLogMessage(message?: string): string | null {
    if (!message) return null;
    return message.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  private registerCustomSkill(userId: number, skill: ParsedSkillFile): void {
    this.registry.registerCustom(userId, {
      name: skill.name,
      description: skill.description,
      category: this.normalizeCategory(skill.category),
      handler: async () => ({
        success: false,
        reply: `Custom skill "${skill.name}" should be executed through SkillService.`,
      }),
      parameters: this.argumentNamesToParameters(skill.argumentNames),
      requiresLlm: true,
      argumentNames: skill.argumentNames,
      filePath: skill.filePath,
    });
  }

  private normalizeCategory(category: string): SkillEntry['category'] {
    if (
      category === 'search' ||
      category === 'analysis' ||
      category === 'generation' ||
      category === 'utility'
    ) {
      return category;
    }
    return 'utility';
  }

  private argumentNamesToParameters(argumentNames?: string[]) {
    return (argumentNames ?? []).map((argumentName) => ({
      name: argumentName,
      description: `Argument: ${argumentName}`,
    }));
  }

  private normalizeSkillName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  }

  private async buildCustomSkillPrompt(skill: ParsedSkillFile): Promise<string> {
    const referenceContent = await this.loadProfileSkillReferenceContent(skill);
    if (!referenceContent) {
      return skill.content;
    }

    return [
      skill.content,
      referenceContent,
      [
        '## Runtime Profile Suggestion Requirement',
        'When the user provides grounded career profile facts, output an API-facing `profile_suggestion` as compact JSON in the final response.',
        '`profile_suggestion.patch` must be a DeepPartial<ProfileRecord>; do not output a full ProfileRecord and do not include unsupported fields.',
        'Use only supported profile groups and fields from the output contract. If sourceThreadId is unknown, set it to null; the backend will attach the conversation source.',
      ].join('\n'),
    ].join('\n\n');
  }

  private async loadProfileSkillReferenceContent(skill: ParsedSkillFile): Promise<string> {
    const skillDir = dirname(skill.filePath);
    const references = [
      ['output_contract.md', 'Output Contract'],
      ['verifier.md', 'Verifier'],
    ];
    const sections: string[] = [];

    for (const [fileName, title] of references) {
      const filePath = join(skillDir, 'references', fileName);
      try {
        const content = await readFile(filePath, 'utf-8');
        sections.push(`## ${title}\n\n${content}`);
      } catch {
        // Missing references should not block skill execution.
      }
    }

    return sections.join('\n\n');
  }
}
