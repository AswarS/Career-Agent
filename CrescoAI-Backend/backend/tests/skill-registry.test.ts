import { describe, test, expect } from 'bun:test';
import { SkillRegistry } from '../src/Network/modules/skill/skill.registry.js';

describe('SkillRegistry', () => {
  test('returns built-in and user custom skills together for a user', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'help',
      description: 'builtin',
      category: 'utility',
      source: 'builtin',
      parameters: [],
      handler: async () => ({ success: true, reply: 'ok' }),
    });
    registry.registerCustom(1, {
      name: 'learning-plan',
      description: 'custom',
      category: 'generation',
      parameters: [],
      handler: async () => ({ success: true, reply: 'ok' }),
      argumentNames: ['topic'],
      filePath: '/tmp/SKILL.md',
      requiresLlm: true,
    });

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll(1).map((entry) => entry.name)).toEqual([
      'help',
      'learning-plan',
    ]);
  });

  test('resolves custom skills by user without hiding built-in skills for others', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'help',
      description: 'builtin',
      category: 'utility',
      source: 'builtin',
      parameters: [],
      handler: async () => ({ success: true, reply: 'ok' }),
    });
    registry.registerCustom(7, {
      name: 'learning-plan',
      description: 'custom',
      category: 'generation',
      parameters: [],
      handler: async () => ({ success: true, reply: 'ok' }),
      argumentNames: ['topic'],
      filePath: '/tmp/SKILL.md',
      requiresLlm: true,
    });

    expect(registry.has('learning-plan')).toBe(false);
    expect(registry.has('learning-plan', 7)).toBe(true);
    expect(registry.get('help', 7)?.source).toBe('builtin');
  });

  test('supports loaded and unloaded state transitions for custom skills', () => {
    const registry = new SkillRegistry();
    registry.registerCustom(3, {
      name: 'learning-plan',
      description: 'custom',
      category: 'generation',
      parameters: [],
      handler: async () => ({ success: true, reply: 'ok' }),
      argumentNames: ['topic'],
      filePath: '/tmp/SKILL.md',
      requiresLlm: true,
    });

    expect(registry.get('learning-plan', 3)?.status).toBe('loaded');
    expect(registry.setStatus('learning-plan', 'unloaded', 3)).toBe(true);
    expect(registry.get('learning-plan', 3)?.status).toBe('unloaded');
  });
});
