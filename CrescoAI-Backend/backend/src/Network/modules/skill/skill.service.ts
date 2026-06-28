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
import { CAREER_AGENT_SKILL_ROUTER_GUIDANCE } from '../../prompts/careerAgentLearningPrompt.js';

type SkillRouteCandidate = {
  name: string;
  description: string;
  category: string;
  source: string;
};

const FAST_ROUTE_MAX_DIRECT_MATCHES = 1;
const LEARNING_ROUTE_KEYWORDS = [
  '学习计划',
  '学习路线',
  '怎么学',
  '系统学习',
  '从零开始',
  '备考',
  '面试准备',
  '求职准备',
  '技能提升',
  '考试复习',
  '课程规划',
  '知识体系',
  'study plan',
  'learning plan',
  'learning path',
  'roadmap',
  'interview prep',
  'exam prep',
  'curriculum',
];
const INTERACTIVE_ROUTE_KEYWORDS = [
  '互动',
  '可视化',
  '模拟',
  '动画',
  '小游戏',
  '图解',
  '交互练习',
  '仪表盘',
  '算法演示',
  '数据结构',
  '流程',
  '时间线',
  'interactive',
  'visualize',
  'visualise',
  'simulation',
  'simulator',
  'animation',
  'game',
  'dashboard',
  'diagram',
  'timeline',
];
const IMAGE_ROUTE_KEYWORDS = [
  '生成图片',
  '画一张',
  '做一张图',
  '图片生成',
  'image generation',
  'generate image',
  'draw an image',
  'create an image',
];
const VIDEO_ROUTE_KEYWORDS = [
  '生成视频',
  '视频生成',
  '做一个视频',
  'generate video',
  'video generation',
  'create a video',
];
const CODE_ROUTE_KEYWORDS = [
  '代码分析',
  '分析代码',
  '代码审查',
  'code analysis',
  'analyze code',
  'analyse code',
  'review this code',
];

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
    const candidates: SkillRouteCandidate[] = skills
      .filter((s) => typeof s.name === 'string' && s.name !== 'skills')
      .map((s) => ({
        name: String(s.name),
        description: String(s.description ?? ''),
        category: String(s.category ?? 'utility'),
        source: String(s.source ?? 'unknown'),
      }));

    if (!candidates.length) return { useSkill: false, reason: 'no_skills' };

    const fastRoute = this.tryFastRouteSkill(content, candidates);
    if (fastRoute.kind === 'skip') {
      return { useSkill: false, reason: fastRoute.reason };
    }
    const routerCandidates =
      fastRoute.kind === 'ambiguous' && fastRoute.candidates.length > 0
        ? fastRoute.candidates
        : candidates;

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

    if (fastRoute.kind === 'direct') {
      return {
        useSkill: true,
        skillName: fastRoute.skillName,
        args: content,
        reason: fastRoute.reason,
      };
    }

    const routerPrompt =
      'You are a strict skill router for CareerAgent.\n' +
      'Given user message and available skills, decide whether to call one skill.\n\n' +
      `${CAREER_AGENT_SKILL_ROUTER_GUIDANCE}\n\n` +
      'Rules:\n' +
      '1) Return ONLY compact JSON.\n' +
      '2) If no skill is beneficial, set useSkill=false.\n' +
      '3) If useSkill=true, skillName must exactly match one available name.\n' +
      '4) args should be concise, preserving the user intent and language.\n' +
      '5) For simple learning queries, prefer using a suitable skill over answering only in text.\n\n' +
      'Examples:\n' +
      'User: "帮我规划三个月 Java 后端学习路线" -> {"useSkill":true,"skillName":"learning-plan","args":"帮我规划三个月 Java 后端学习路线","reason":"structured learning plan request"}\n' +
      'User: "用互动方式教我理解递归" -> {"useSkill":true,"skillName":"develop-web-game","args":"用互动方式教我理解递归","reason":"interactive visual learning request"}\n' +
      'User: "你好" -> {"useSkill":false,"skillName":"","args":"","reason":"greeting"}\n\n' +
      `Available skills JSON:\n${JSON.stringify(routerCandidates)}\n\n` +
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

  private tryFastRouteSkill(
    content: string,
    candidates: SkillRouteCandidate[],
  ):
    | { kind: 'direct'; skillName: string; reason: string }
    | { kind: 'ambiguous'; candidates: SkillRouteCandidate[]; reason: string }
    | { kind: 'skip'; reason: string }
    | { kind: 'none' } {
    const normalized = content.trim().toLowerCase();
    if (!normalized) {
      return { kind: 'skip', reason: 'empty_message' };
    }

    if (this.isClearlyNonSkillMessage(normalized)) {
      return { kind: 'skip', reason: 'local_non_skill_message' };
    }

    const candidateNames = new Set(candidates.map((candidate) => candidate.name));
    const matchedNames = new Set<string>();
    const addIfAvailable = (skillName: string) => {
      if (candidateNames.has(skillName)) {
        matchedNames.add(skillName);
      }
    };

    if (this.matchesAny(normalized, LEARNING_ROUTE_KEYWORDS)) {
      addIfAvailable('learning-plan');
      this.addCandidatesMatchingKeywords(candidates, LEARNING_ROUTE_KEYWORDS, matchedNames);
    }

    if (this.matchesAny(normalized, INTERACTIVE_ROUTE_KEYWORDS)) {
      addIfAvailable('develop-web-game');
      this.addCandidatesMatchingKeywords(candidates, INTERACTIVE_ROUTE_KEYWORDS, matchedNames);
    }

    if (this.matchesAny(normalized, IMAGE_ROUTE_KEYWORDS)) {
      addIfAvailable('image-generation');
      this.addCandidatesMatchingKeywords(candidates, IMAGE_ROUTE_KEYWORDS, matchedNames);
    }

    if (this.matchesAny(normalized, VIDEO_ROUTE_KEYWORDS)) {
      addIfAvailable('video-generation');
      this.addCandidatesMatchingKeywords(candidates, VIDEO_ROUTE_KEYWORDS, matchedNames);
    }

    if (this.matchesAny(normalized, CODE_ROUTE_KEYWORDS)) {
      addIfAvailable('code-analysis');
      this.addCandidatesMatchingKeywords(candidates, CODE_ROUTE_KEYWORDS, matchedNames);
    }

    const matched = candidates.filter((candidate) => matchedNames.has(candidate.name));
    if (matched.length === 0) {
      return { kind: 'none' };
    }

    if (matched.length <= FAST_ROUTE_MAX_DIRECT_MATCHES) {
      return {
        kind: 'direct',
        skillName: matched[0]!.name,
        reason: 'local_fast_route',
      };
    }

    return {
      kind: 'ambiguous',
      candidates: matched,
      reason: 'local_fast_route_ambiguous',
    };
  }

  private isClearlyNonSkillMessage(normalized: string): boolean {
    const compact = normalized.replace(/[!！.。?？,，\s]/g, '');
    return new Set([
      '你好',
      '您好',
      'hello',
      'hi',
      'hey',
      '谢谢',
      'thanks',
      'thankyou',
    ]).has(compact);
  }

  private addCandidatesMatchingKeywords(
    candidates: SkillRouteCandidate[],
    keywords: string[],
    matchedNames: Set<string>,
  ): void {
    for (const candidate of candidates) {
      if (this.matchesAny(this.candidateSearchText(candidate), keywords)) {
        matchedNames.add(candidate.name);
      }
    }
  }

  private candidateSearchText(candidate: SkillRouteCandidate): string {
    return [
      candidate.name,
      candidate.description,
      candidate.category,
    ].join(' ').toLowerCase();
  }

  private matchesAny(value: string, needles: string[]): boolean {
    return needles.some((needle) => value.includes(needle.toLowerCase()));
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
