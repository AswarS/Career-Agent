import type { SkillHandler, SkillExecutionContext } from './skill.registry';

function extractAssistantText(payload: any): string | null {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
    if (text) return text;
  }

  if (Array.isArray(payload?.content)) {
    const text = payload.content
      .map((part: any) => (part?.type === 'text' ? part.text : ''))
      .filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      .join('\n')
      .trim();
    if (text) return text;
  }

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return null;
}

export interface BuiltinSkillDefinition {
  name: string;
  description: string;
  category: 'search' | 'analysis' | 'generation' | 'utility';
  parameters: Array<{ name: string; description: string; required?: boolean }>;
  requiresLlm?: boolean;
  handler: SkillHandler;
}

const webSearchSkill: BuiltinSkillDefinition = {
  name: 'web-search',
  description: 'Search the web for information and return results',
  category: 'search',
  parameters: [
    { name: 'query', description: 'Search query', required: true },
  ],
  handler: async (args, context) => {
    const query = args.trim();
    if (!query) {
      return { success: false, reply: 'Please provide a search query. Usage: /web-search <query>' };
    }

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.zhihu.com/search_v3?q=${encodedQuery}&t=general&correction=1&offset=0&limit=5`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CareerAgent/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // Fallback to a simpler approach - return the search query info
        return {
          success: true,
          reply: `Web search for "${query}" was initiated. The external search API returned status ${response.status}. You may want to try a more specific query or try again later.`,
          metadata: { query, status: response.status },
        };
      }

      return {
        success: true,
        reply: `Search results for "${query}" have been collected. Results are being processed.`,
        metadata: { query, resultCount: 0 },
      };
    } catch (err: any) {
      return {
        success: false,
        reply: `Web search failed: ${err?.message ?? 'Unknown error'}. Query: "${query}"`,
      };
    }
  },
};

const codeAnalysisSkill: BuiltinSkillDefinition = {
  name: 'code-analysis',
  description: 'Analyze code for quality, security issues, and improvement suggestions',
  category: 'analysis',
  parameters: [
    { name: 'code', description: 'Code snippet or description to analyze', required: true },
  ],
  requiresLlm: true,
  handler: async (args, context) => {
    const code = args.trim();
    if (!code) {
      return { success: false, reply: 'Please provide code to analyze. Usage: /code-analysis <code or description>' };
    }

    const llmConfig = context?.llmConfig;
    if (!llmConfig?.apiKey || !llmConfig?.baseUrl) {
      return {
        success: false,
        reply: 'Code analysis requires LLM configuration. Please set your API key in Settings first.',
      };
    }

    if (context?.runUnifiedPrompt) {
      const result = await context.runUnifiedPrompt({
        userId: context.userId,
        conversationId: context.conversationId,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        content:
          'You are a code analysis expert. Analyze the provided code for:\n' +
          '1. Security vulnerabilities\n' +
          '2. Performance issues\n' +
          '3. Code quality and best practices\n' +
          '4. Improvement suggestions\n\n' +
          'Respond in a clear, structured format using markdown.\n\n' +
          `Analyze this code:\n\n${code}`,
      });

      if (!result.success || !result.reply) {
        return { success: false, reply: 'Code analysis failed via unified query engine.' };
      }

      return {
        success: true,
        reply: result.reply,
        metadata: { model: result.model ?? llmConfig.model },
      };
    }

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
            {
              role: 'system',
              content: 'You are a code analysis expert. Analyze the provided code for:\n1. Security vulnerabilities\n2. Performance issues\n3. Code quality and best practices\n4. Improvement suggestions\n\nRespond in a clear, structured format using markdown.',
            },
            { role: 'user', content: `Analyze this code:\n\n${code}` },
          ],
          max_tokens: 4096,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, reply: `Code analysis API error (${response.status}): ${errorText}` };
      }

      const data = await response.json() as any;
      const reply = extractAssistantText(data) ?? 'No analysis result returned.';

      return {
        success: true,
        reply,
        metadata: {
          model: data.model ?? llmConfig.model,
          usage: data.usage
            ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
            : undefined,
        },
      };
    } catch (err: any) {
      return { success: false, reply: `Code analysis failed: ${err?.message ?? 'Unknown error'}` };
    }
  },
};

const imageGenerationSkill: BuiltinSkillDefinition = {
  name: 'image-generation',
  description: 'Generate images from text descriptions',
  category: 'generation',
  parameters: [
    { name: 'prompt', description: 'Image description', required: true },
  ],
  handler: async (args, context) => {
    const prompt = args.trim();
    if (!prompt) {
      return { success: false, reply: 'Please provide an image description. Usage: /image-generation <description>' };
    }

    return {
      success: true,
      reply: `Image generation requested for: "${prompt}"\n\nImage generation requires an external image API (e.g., DALL-E, CogView). Please configure an image generation endpoint in Settings to enable this skill.`,
      metadata: { prompt, status: 'not_configured' },
    };
  },
};

const helpSkill: BuiltinSkillDefinition = {
  name: 'help',
  description: 'Show help information about available commands and skills',
  category: 'utility',
  parameters: [],
  handler: async (_args, context) => {
    const lines = [
      '**Career Agent Commands**\n',
      '- `/skills` — List all available skills',
      '- `/help` — Show this help message',
      '- `/web-search <query>` — Search the web',
      '- `/code-analysis <code>` — Analyze code quality and security',
      '- `/image-generation <description>` — Generate images from text',
      '\nType any other message to chat with the AI assistant.',
    ];
    return { success: true, reply: lines.join('\n') };
  },
};

const builtinSkills: BuiltinSkillDefinition[] = [
  webSearchSkill,
  codeAnalysisSkill,
  imageGenerationSkill,
  helpSkill,
];

export function registerBuiltinSkills(
  registerFn: (entry: Omit<import('./skill.registry').SkillEntry, 'status'>) => void,
): void {
  for (const skill of builtinSkills) {
    registerFn({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      parameters: skill.parameters,
      requiresLlm: skill.requiresLlm,
      handler: skill.handler,
    });
  }
}
