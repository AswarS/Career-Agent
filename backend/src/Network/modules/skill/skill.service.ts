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
import {
  listUserSkills,
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

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  async listSkills(
    userId?: number,
    category?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const builtin = category
      ? this.registry.getByCategory(category as SkillEntry['category'])
      : this.registry.getAll();

    const result: Array<Record<string, unknown>> = builtin.map((entry) => ({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      parameters: entry.parameters,
      requiresLlm: entry.requiresLlm,
      status: entry.status,
      source: 'builtin',
    }));

    if (userId) {
      const custom = await listUserSkills(userId);
      for (const skill of custom) {
        if (category && skill.category !== category) continue;
        result.push({
          name: skill.name,
          description: skill.description,
          category: skill.category,
          source: 'custom',
          arguments: skill.argumentNames,
        });
      }
    }

    return result;
  }

  async getSkillDetail(
    name: string,
    userId?: number,
  ): Promise<Record<string, unknown> | null> {
    const builtin = this.registry.get(name);
    if (builtin) {
      return {
        name: builtin.name,
        description: builtin.description,
        category: builtin.category,
        parameters: builtin.parameters,
        requiresLlm: builtin.requiresLlm,
        status: builtin.status,
        source: 'builtin',
      };
    }

    if (userId) {
      const custom = await readSkillFile(userId, name);
      if (custom) {
        return {
          name: custom.name,
          description: custom.description,
          category: custom.category,
          arguments: custom.argumentNames,
          source: 'custom',
        };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Custom skill CRUD (SKILL.md files)
  // ---------------------------------------------------------------------------

  async createCustomSkill(
    userId: number,
    name: string,
    description: string,
    content: string,
    category: string = 'utility',
    argNames?: string,
  ): Promise<{ name: string; filePath: string }> {
    const normalizedName = name.trim().toLowerCase().replace(/[\s_]+/g, '-');

    // Check for conflict with builtin
    if (this.registry.has(normalizedName)) {
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

    return { name: normalizedName, filePath };
  }

  async updateCustomSkill(
    userId: number,
    name: string,
    updates: { description?: string; content?: string; category?: string; argNames?: string },
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
    return true;
  }

  async deleteCustomSkill(userId: number, name: string): Promise<boolean> {
    return deleteSkillFile(userId, name);
  }

  // ---------------------------------------------------------------------------
  // Invocation (native chain: expand prompt → send to LLM)
  // ---------------------------------------------------------------------------

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
    // 1. Try builtin skill (hardcoded handler)
    const builtin = this.registry.get(name);
    if (builtin) {
      if (builtin.status !== 'loaded') {
        throw new ForbiddenException({ error: 'Skill not loaded', skill: name });
      }
      try {
        return await builtin.handler(args, context);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, reply: `Skill execution failed: ${message}` };
      }
    }

    // 2. Try custom skill (SKILL.md → expand → LLM)
    if (context?.userId) {
      const custom = await readSkillFile(context.userId, name);
      if (custom) {
        return this.invokeCustomSkill(custom, args, context);
      }
    }

    throw new ForbiddenException({ error: 'Skill not found', skill: name });
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
        reply: '此 skill 需要 LLM 配置。请在设置中配置 API Key。',
      };
    }

    // Native chain: substituteArguments (same as Claude Code)
    const expanded = substituteArguments(
      skill.content,
      args,
      true,
      skill.argumentNames,
    );

    const baseUrl = llmConfig.baseUrl.replace(/\/+$/, '');
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.model ?? 'glm-4',
          messages: [
            { role: 'system', content: expanded },
            { role: 'user', content: args || '请执行' },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          reply: `LLM API error (${response.status}): ${errorText}`,
        };
      }

      const data = (await response.json()) as any;
      const reply =
        data.choices?.[0]?.message?.content ?? 'No result returned.';

      return {
        success: true,
        reply,
        metadata: {
          model: data.model ?? llmConfig.model,
          usage: data.usage
            ? {
                input_tokens: data.usage.prompt_tokens,
                output_tokens: data.usage.completion_tokens,
              }
            : undefined,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, reply: `Skill execution failed: ${message}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Existence check (for conversation routing)
  // ---------------------------------------------------------------------------

  async skillExists(name: string, userId?: number): Promise<boolean> {
    if (this.registry.has(name)) return true;
    if (userId) {
      const custom = await readSkillFile(userId, name);
      return custom !== null;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------

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
    if (this.registry.has(parsed.skillName)) return true;
    if (userId) {
      const custom = await readSkillFile(userId, parsed.skillName);
      if (custom) return true;
    }
    return false;
  }
}