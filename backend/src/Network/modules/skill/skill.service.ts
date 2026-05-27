import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  SkillRegistry,
  type SkillHandler,
  type SkillHandlerResult,
  type SkillExecutionContext,
  type SkillEntry,
} from './skill.registry';
import { registerBuiltinSkills } from './built-in-skills';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SkillService implements OnModuleInit {
  constructor(
    public readonly registry: SkillRegistry,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  onModuleInit() {
    registerBuiltinSkills((entry) => {
      this.registry.register(entry);
    });
    console.log(
      '[SkillService] Built-in skills loaded:',
      this.registry.getAll().map((s) => s.name).join(', '),
    );
  }

  listSkills(category?: string): Array<SkillEntry & { status: string }> {
    const skills = category
      ? this.registry.getByCategory(category as SkillEntry['category'])
      : this.registry.getAll();
    return skills.map((entry) => ({ ...entry }));
  }

  getSkillDetail(name: string): (SkillEntry & { status: string }) | null {
    const entry = this.registry.get(name);
    return entry ? { ...entry } : null;
  }

  registerSkill(
    name: string,
    description: string,
    category: SkillEntry['category'] = 'utility',
    handler?: SkillHandler,
  ): SkillEntry {
    const stubHandler: SkillHandler =
      handler ??
      (async (args) => ({
        success: true,
        reply: `[${name}] Executed with args: "${args}"`,
      }));

    const entry = {
      name,
      description,
      category,
      parameters: [],
      handler: stubHandler,
    };

    this.registry.register(entry);
    return this.registry.get(name)!;
  }

  async buildExecutionContext(
    userId?: number,
    conversationId?: string,
  ): Promise<SkillExecutionContext> {
    const context: SkillExecutionContext = { userId, conversationId };

    if (this.settingsService && userId) {
      const saved = await this.settingsService.getSettings(userId);
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
    const entry = this.registry.get(name);

    if (!entry) {
      throw new ForbiddenException({ error: 'Skill not found', skill: name });
    }

    if (entry.status !== 'loaded') {
      throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
    }

    try {
      return await entry.handler(args, context);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        reply: `Skill execution failed: ${message}`,
      };
    }
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

  isSkillCommand(content: string): boolean {
    const parsed = this.parseSkillInvocation(content);
    if (!parsed) return false;
    return parsed.skillName === 'skills' || this.registry.has(parsed.skillName);
  }
}
