import type { SkillHandler } from './skill.registry';

interface BuiltinSkillDefinition {
  name: string;
  description: string;
  handler: SkillHandler;
}

const builtinSkills: BuiltinSkillDefinition[] = [
  {
    name: 'image-generation',
    description: 'Generate images from text descriptions',
    handler: async (args) => ({
      success: true,
      reply: `[image-generation] Stub response for prompt: "${args}"`,
    }),
  },
  {
    name: 'web-search',
    description: 'Search the web for information',
    handler: async (args) => ({
      success: true,
      reply: `[web-search] Stub response for query: "${args}"`,
    }),
  },
  {
    name: 'code-analysis',
    description: 'Analyze code for quality and security issues',
    handler: async (args) => ({
      success: true,
      reply: `[code-analysis] Stub response for: "${args}"`,
    }),
  },
];

export function registerBuiltinSkills(
  registerFn: (name: string, description: string, handler: SkillHandler) => void,
): void {
  for (const skill of builtinSkills) {
    registerFn(skill.name, skill.description, skill.handler);
  }
}
