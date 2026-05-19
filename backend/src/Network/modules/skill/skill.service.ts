import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { SkillRegistry, type SkillHandler, type SkillHandlerResult } from './skill.registry';
import { registerBuiltinSkills } from './built-in-skills';

@Injectable()
export class SkillService implements OnModuleInit {
  constructor(public readonly registry: SkillRegistry) {}

  onModuleInit() {
    registerBuiltinSkills((name, description, handler) => {
      this.registry.register(name, description, handler);
    });
    console.log(
      '[SkillService] Built-in skills loaded:',
      this.registry.getAll().map((s) => s.name).join(', '),
    );
  }

  listSkills(): Array<{ name: string; status: string; description: string }> {
    return this.registry.getAll().map((entry) => ({
      name: entry.name,
      status: entry.status,
      description: entry.description,
    }));
  }

  registerSkill(
    name: string,
    description: string,
    handler?: SkillHandler,
  ): { name: string; status: string; description: string } {
    const stubHandler: SkillHandler =
      handler ??
      (async (args) => ({
        success: true,
        reply: `[${name}] Stub response for: "${args}"`,
      }));

    this.registry.register(name, description, stubHandler);

    return {
      name,
      status: 'loaded',
      description,
    };
  }

  async invokeSkill(
    name: string,
    args: string,
    context?: Record<string, unknown>,
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
      const message =
        err instanceof Error ? err.message : String(err);
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
}
