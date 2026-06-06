import {
  ForbiddenException,
  Injectable,
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
  readSkillFile,
  writeSkillFile,
  deleteSkillFile,
  type ParsedSkillFile,
} from './skill-file-store';
import { substituteArguments } from '../../../utils/argumentSubstitution.js';

@Injectable()
export class SkillService implements OnModuleInit {
  constructor(
    public readonly registry: SkillRegistry,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly agentService?: AgentService,
  ) {}

  async onModuleInit() {
    registerBuiltinSkills((entry) => {
      this.registry.register(entry);
    });
    await this.loadCustomSkillsFromDisk();
    console.log(
      '[SkillService] Skills loaded:',
      this.registry.getAll().map((s) => s.name).join(', '),
    );
  }

  async listSkills(
    userId?: number,
    category?: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (userId) {
      await this.syncUserSkills(userId);
    }

    const loadedSkills = category
      ? this.registry.getByCategory(category as SkillEntry['category'], userId)
      : this.registry.getAll(userId);

    return loadedSkills.map((entry) => ({
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
  }

  async getSkillDetail(
    name: string,
    userId?: number,
  ): Promise<Record<string, unknown> | null> {
    if (userId) {
      await this.syncUserSkills(userId);
    }

    const entry = this.registry.get(name, userId);
    if (!entry) {
      return null;
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

  async invokeSkill(
    name: string,
    args: string,
    context?: SkillExecutionContext,
  ): Promise<SkillHandlerResult> {
    const mergedContext: SkillExecutionContext = { ...(context ?? {}) };
    if (mergedContext.userId) {
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
        });
      mergedContext.runInSession = async (callback) =>
        this.agentService!.runInSessionContext({
          userId: String(mergedContext.userId ?? 1),
          conversationId: mergedContext.conversationId,
          callback: async (sessionContext) =>
            callback({ abortController: sessionContext.abortController }),
        });
    }

    const entry = this.registry.get(name, mergedContext.userId);
    if (!entry) {
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    console.log(
      `[SkillService] invokeSkill source=${entry.source} name=${name} userId=${mergedContext.userId ?? 'unknown'} conversationId=${mergedContext.conversationId ?? 'unknown'}`,
    );

    if (entry.status !== 'loaded') {
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    if (entry.source === 'builtin') {
      try {
        return await entry.handler(args, mergedContext);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, reply: `Skill execution failed: ${message}` };
      }
    }

    if (!mergedContext.userId) {
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    const custom = await readSkillFile(mergedContext.userId, name);
    if (!custom) {
      this.registry.setStatus(name, 'unloaded', mergedContext.userId);
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    return this.invokeCustomSkill(custom, args, mergedContext);
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

    const expanded = substituteArguments(
      skill.content,
      args,
      true,
      skill.argumentNames,
    );

    try {
      if (!this.agentService) {
        return {
          success: false,
          reply: 'Skill backend is not ready: AgentService unavailable.',
        };
      }

      const result = await this.agentService.runIsolatedPrompt({
        userId: String(context.userId ?? 1),
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
    if (userId) {
      await this.syncUserSkills(userId);
    }
    return this.registry.has(name, userId);
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
    if (userId) {
      await this.syncUserSkills(userId);
    }
    return this.registry.has(parsed.skillName, userId);
  }

  async autoSelectSkill(
    content: string,
    userId: number,
    conversationId?: string,
  ): Promise<{ useSkill: boolean; skillName?: string; args?: string; reason?: string }> {
    if (!this.agentService) {
      return { useSkill: false, reason: 'agent_service_unavailable' };
    }

    const skills = await this.listSkills(userId);
    const candidates = skills
      .filter((s) => typeof s.name === 'string' && s.name !== 'skills')
      .map((s) => ({
        name: String(s.name),
        description: String(s.description ?? ''),
        category: String(s.category ?? 'utility'),
        source: String(s.source ?? 'unknown'),
      }));

    if (!candidates.length) return { useSkill: false, reason: 'no_skills' };

    let llmConfig: SkillExecutionContext['llmConfig'] | undefined;
    if (this.settingsService) {
      const saved = await this.settingsService.getApiSettings(userId);
      if (saved) {
        llmConfig = {
          apiKey: saved.apiKey ?? undefined,
          baseUrl: saved.baseUrl ?? undefined,
          model: saved.model ?? undefined,
        };
      }
    }
    if (!llmConfig?.apiKey || !llmConfig?.baseUrl) {
      return { useSkill: false, reason: 'llm_not_configured' };
    }

    const routerPrompt =
      'You are a strict skill router.\n' +
      'Given user message and available skills, decide whether to call one skill.\n' +
      'Rules:\n' +
      '1) Return ONLY compact JSON.\n' +
      '2) If no skill is clearly beneficial, set useSkill=false.\n' +
      '3) If useSkill=true, skillName must exactly match one available name.\n' +
      '4) args should be concise, preserving user intent.\n\n' +
      `Available skills JSON:\n${JSON.stringify(candidates)}\n\n` +
      `User message:\n${content}\n\n` +
      'Output schema:\n{"useSkill":boolean,"skillName":"string","args":"string","reason":"string"}';

    const route = await this.agentService.runIsolatedPrompt({
      userId: String(userId),
      conversationId,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
      content: routerPrompt,
    });

    if (!route.success || !route.reply) {
      return { useSkill: false, reason: 'router_failed' };
    }

    try {
      const matched = route.reply.match(/\{[\s\S]*\}/);
      if (!matched) return { useSkill: false, reason: 'router_no_json' };
      const parsed = JSON.parse(matched[0]) as {
        useSkill?: boolean;
        skillName?: string;
        args?: string;
        reason?: string;
      };
      if (!parsed.useSkill || !parsed.skillName) {
        return { useSkill: false, reason: parsed.reason ?? 'router_declined' };
      }
      const exists = await this.skillExists(parsed.skillName, userId);
      if (!exists) return { useSkill: false, reason: 'router_skill_not_found' };
      return {
        useSkill: true,
        skillName: parsed.skillName,
        args: parsed.args ?? content,
        reason: parsed.reason ?? 'router_selected',
      };
    } catch {
      return { useSkill: false, reason: 'router_parse_failed' };
    }
  }

  private async loadCustomSkillsFromDisk(): Promise<void> {
    const allSkills = await listAllUserSkills();
    for (const { userId, skill } of allSkills) {
      this.registerCustomSkill(userId, skill);
    }
  }

  private async syncUserSkills(userId: number): Promise<void> {
    const diskSkills = await listUserSkills(userId);
    const diskNames = new Set(diskSkills.map((skill) => skill.name));

    for (const skill of diskSkills) {
      this.registerCustomSkill(userId, skill);
    }

    for (const entry of this.registry.getCustomForUser(userId)) {
      if (!diskNames.has(entry.name)) {
        this.registry.unregisterCustom(userId, entry.name);
      }
    }
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
}
