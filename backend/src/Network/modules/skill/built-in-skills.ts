import type { SkillHandler } from './skill.registry';
import { ImageGenerateTool } from '../../../tools/ImageGenerateTool/ImageGenerateTool.js';
import { VideoGenerateTool } from '../../../tools/VideoGenerateTool/VideoGenerateTool.js';

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

function parseStructuredArgs<T extends Record<string, unknown>>(
  args: string,
  fallbackKey: string,
): T | null {
  const trimmed = args.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{')) {
    return { [fallbackKey]: trimmed } as T;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {}
  return { [fallbackKey]: trimmed } as T;
}

export interface BuiltinSkillDefinition {
  name: string;
  description: string;
  category: 'analysis' | 'generation' | 'utility';
  parameters: Array<{ name: string; description: string; required?: boolean }>;
  requiresLlm?: boolean;
  handler: SkillHandler;
}

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
          Authorization: `Bearer ${llmConfig.apiKey}`,
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

      const data = (await response.json()) as any;
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
  parameters: [{ name: 'prompt', description: 'Image description', required: true }],
  handler: async (args, context) => {
    const parsed = parseStructuredArgs<{
      prompt?: string;
      model?: string;
      size?: string;
      n?: number;
      image_url?: string;
    }>(args, 'prompt');
    const prompt = parsed?.prompt?.trim() ?? '';
    if (!prompt) {
      return { success: false, reply: 'Please provide an image description. Usage: /image-generation <description>' };
    }

    if (!context?.runInSession) {
      return {
        success: false,
        reply: 'Image generation is unavailable because the session context is missing.',
      };
    }

    try {
      const result = await context.runInSession(async ({ abortController }) =>
        ImageGenerateTool.call(
          {
            prompt,
            model: typeof parsed?.model === 'string' ? parsed.model : undefined,
            size: typeof parsed?.size === 'string' ? parsed.size : undefined,
            n: typeof parsed?.n === 'number' ? parsed.n : undefined,
            image_url: typeof parsed?.image_url === 'string' ? parsed.image_url : undefined,
          },
          { abortController } as any,
          undefined as any,
          undefined as any,
        ),
      );

      const data = result?.data as
        | { filePaths?: string[]; model?: string; error?: string }
        | undefined;
      if (data?.error) {
        return { success: false, reply: data.error };
      }
      const filePaths = data?.filePaths ?? [];
      if (!filePaths.length) {
        return { success: false, reply: 'Image generation finished but no files were produced.' };
      }

      return {
        success: true,
        reply: `Generated ${filePaths.length} image(s) for "${prompt}".`,
        metadata: { prompt, model: data?.model },
        outputFiles: filePaths.map((path) => ({ path, kind: 'image' as const })),
      };
    } catch (err: any) {
      return {
        success: false,
        reply: `Image generation failed: ${err?.message ?? 'Unknown error'}`,
      };
    }
  },
};

const videoGenerationSkill: BuiltinSkillDefinition = {
  name: 'video-generation',
  description: 'Generate videos from text descriptions',
  category: 'generation',
  parameters: [{ name: 'prompt', description: 'Video description', required: true }],
  handler: async (args, context) => {
    const parsed = parseStructuredArgs<{
      prompt?: string;
      model?: string;
      resolution?: string;
      aspect_ratio?: string;
      duration?: number;
      generate_audio?: boolean;
      frame_image?: string;
    }>(args, 'prompt');
    const prompt = parsed?.prompt?.trim() ?? '';
    if (!prompt) {
      return { success: false, reply: 'Please provide a video description. Usage: /video-generation <description>' };
    }

    if (!context?.runInSession) {
      return {
        success: false,
        reply: 'Video generation is unavailable because the session context is missing.',
      };
    }

    try {
      const result = await context.runInSession(async ({ abortController }) =>
        VideoGenerateTool.call(
          {
            prompt,
            model: typeof parsed?.model === 'string' ? parsed.model : undefined,
            resolution: typeof parsed?.resolution === 'string' ? parsed.resolution : undefined,
            aspect_ratio: typeof parsed?.aspect_ratio === 'string' ? parsed.aspect_ratio : undefined,
            duration: typeof parsed?.duration === 'number' ? parsed.duration : undefined,
            generate_audio:
              typeof parsed?.generate_audio === 'boolean' ? parsed.generate_audio : undefined,
            frame_image:
              typeof parsed?.frame_image === 'string' ? parsed.frame_image : undefined,
          },
          { abortController } as any,
          undefined as any,
          undefined as any,
        ),
      );

      const data = result?.data as
        | { filePath?: string; model?: string; error?: string }
        | undefined;
      if (data?.error) {
        return { success: false, reply: data.error };
      }
      if (!data?.filePath) {
        return { success: false, reply: 'Video generation finished but no file was produced.' };
      }

      return {
        success: true,
        reply: `Generated a video for "${prompt}".`,
        metadata: { prompt, model: data?.model },
        outputFiles: [{ path: data.filePath, kind: 'video' as const }],
      };
    } catch (err: any) {
      return {
        success: false,
        reply: `Video generation failed: ${err?.message ?? 'Unknown error'}`,
      };
    }
  },
};

const helpSkill: BuiltinSkillDefinition = {
  name: 'help',
  description: 'Show help information about available commands and skills',
  category: 'utility',
  parameters: [],
  handler: async () => {
    const lines = [
      '**Career Agent Commands**',
      '',
      '- `/skills` - List all available skills',
      '- `/help` - Show this help message',
      '- `/create-skill <json>` - Create a custom skill for the current user',
      '- `/code-analysis <code>` - Analyze code quality and security',
      '- `/image-generation <prompt>` - Generate images using the configured multimodal image API',
      '- `/video-generation <prompt>` - Generate videos using the configured multimodal video API',
      '',
      'Type any other message to chat with the AI assistant.',
    ];
    return { success: true, reply: lines.join('\n') };
  },
};

const builtinSkills: BuiltinSkillDefinition[] = [
  codeAnalysisSkill,
  imageGenerationSkill,
  videoGenerationSkill,
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
      source: 'builtin',
      parameters: skill.parameters,
      requiresLlm: skill.requiresLlm,
      handler: skill.handler,
    });
  }
}
