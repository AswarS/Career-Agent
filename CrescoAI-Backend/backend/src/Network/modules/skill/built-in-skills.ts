import type { SkillHandler, SkillHandlerResult } from './skill.registry';
import { ImageGenerateTool } from '../../../tools/ImageGenerateTool/ImageGenerateTool.js';
import { VideoGenerateTool } from '../../../tools/VideoGenerateTool/VideoGenerateTool.js';
import { skillLogger } from '../../utils/skillLogger.js';
import { readFile, copyFile, cp, mkdir, stat } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        outputFiles: result.generatedFiles,
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
          { abortController } as any
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
          { abortController } as any
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
      '- `/learning-plan <topic>` - Generate structured long-term learning plan with interactive HTML apps',
      '- `/develop-web-game <description>` - Build visual/interactive web programs (games, animations, simulations)',
      '',
      'Type any other message to chat with the AI assistant.',
    ];
    return { success: true, reply: lines.join('\n') };
  },
};

// Resolve the skills directory relative to this file.
// This file lives at: CrescoAI-Backend/backend/src/Network/modules/skill/built-in-skills.ts
// Project skills at:  <project-root>/skills/
// Path: skill → modules → Network → src → backend → CrescoAI-Backend → project-root
const __skillFileDir = fileURLToPath(new URL('.', import.meta.url));
const SKILLS_DIR = join(__skillFileDir, '..', '..', '..', '..', '..', '..', 'skills');

// Network user data directory: CrescoAI-Backend/backend/src/Network/user/
const USER_DATA_DIR = join(__skillFileDir, '..', '..', 'user');

// Helper function to load skill content from project skills directory
async function loadSkillContent(skillName: string): Promise<string | null> {
  try {
    const skillFilePath = join(SKILLS_DIR, skillName, 'SKILL.md');
    const content = await readFile(skillFilePath, 'utf-8');

    // Parse frontmatter and extract markdown content
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (match) {
      return match[2].trim(); // Return only the markdown content after frontmatter
    }
    return content.trim();
  } catch (err: any) {
    return null;
  }
}

/**
 * Parse the OUTPUT_ARTIFACT line from the AI's reply.
 * Expected format: OUTPUT_ARTIFACT: {"url":"...","type":"html|app|image|audio|video","description":"..."}
 */
type OutputArtifactKind = 'html' | 'app' | 'image' | 'audio' | 'video';
const OUTPUT_ARTIFACT_KINDS = new Set<OutputArtifactKind>(['html', 'app', 'image', 'audio', 'video']);

function parseOutputArtifact(reply: string): {
  url: string;
  type: OutputArtifactKind;
  description: string;
} | null {
  const regex = /OUTPUT_ARTIFACT:\s*(\{[\s\S]*?\})\s*$/m;
  const match = reply.match(regex);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (
      parsed &&
      typeof parsed.url === 'string' &&
      typeof parsed.type === 'string' &&
      OUTPUT_ARTIFACT_KINDS.has(parsed.type as OutputArtifactKind)
    ) {
      return {
        url: parsed.url,
        type: parsed.type as OutputArtifactKind,
        description: parsed.description ?? '',
      };
    }
  } catch {}
  return null;
}

/**
 * Strip the OUTPUT_ARTIFACT line from the reply text shown to the user.
 */
function stripArtifactLine(reply: string): string {
  return reply.replace(/\n*OUTPUT_ARTIFACT:\s*\{[\s\S]*?\}\s*$/m, '').trim();
}

async function copyGeneratedArtifactToUserDir(
  originalPath: string,
  kind: OutputArtifactKind,
  userId: number,
): Promise<string> {
  const originalStat = await stat(originalPath);
  const sourcePath =
    kind === 'app' && !originalStat.isDirectory() && basename(originalPath).toLowerCase() === 'index.html'
      ? dirname(originalPath)
      : originalPath;
  const sourceStat = sourcePath === originalPath ? originalStat : await stat(sourcePath);
  const targetDir = join(USER_DATA_DIR, String(userId), 'workspace', `${kind}_generated`);
  await mkdir(targetDir, { recursive: true });
  const targetPath = join(targetDir, basename(sourcePath));

  if (sourceStat.isDirectory()) {
    await cp(sourcePath, targetPath, { recursive: true, force: true });
  } else {
    await copyFile(sourcePath, targetPath);
  }

  return targetPath;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Fallback: try to extract a file path from the AI reply when OUTPUT_ARTIFACT is missing.
 * Looks for common patterns like absolute paths ending in .html or directory paths.
 */
function extractFilePathFromReply(reply: string): string | null {
  // Match absolute paths (Unix or Windows) ending in .html
  const absHtmlMatch = reply.match(/(?:["'`]|wrote to |saved to |created |file:\s*)((?:\/|[A-Z]:\\)[^\s"'`\n]+\.html)\b/i);
  if (absHtmlMatch) return absHtmlMatch[1];

  // Match absolute paths to directories containing index.html
  const absDirMatch = reply.match(/(?:["'`]|wrote to |saved to |created )((?:\/|[A-Z]:\\)[^\s"'`\n]+[/\\]index\.html)\b/i);
  if (absDirMatch) return absDirMatch[1];

  // Match backtick-wrapped paths that look like filesystem paths
  const backtickMatch = reply.match(/`((?:\/|[A-Z]:\\)[^`\n]+\.html)`/i);
  if (backtickMatch) return backtickMatch[1];

  return null;
}

const learningPlanSkill: BuiltinSkillDefinition = {
  name: 'learning-plan',
  description: '生成结构化长期学习计划（JSON）与配套 HTML 交互应用需求文档（Markdown）。当用户提到学习计划、学习路线、备考、怎么学某个主题、求职准备、技能提升、考试复习、知识体系梳理、课程规划时触发此技能。',
  category: 'utility',
  parameters: [
    { name: 'topic', description: 'Learning topic or goal description', required: true },
  ],
  requiresLlm: true,
  handler: async (args, context) => {
    const topic = args.trim();
    if (!topic) {
      return {
        success: false,
        reply: 'Please provide a learning topic or goal. Usage: /learning-plan <topic>'
      };
    }

    const llmConfig = context?.llmConfig;
    if (!llmConfig?.apiKey || !llmConfig?.baseUrl) {
      return {
        success: false,
        reply: 'Learning plan skill requires LLM configuration. Please set your API key in Settings first.',
      };
    }

    // Load the skill content
    const skillContent = await loadSkillContent('learning-plan');
    if (!skillContent) {
      return {
        success: false,
        reply: 'Failed to load learning-plan skill content. Please ensure skills/learning-plan/SKILL.md exists.',
      };
    }

    if (context?.runUnifiedPrompt) {
      const result = await context.runUnifiedPrompt({
        userId: context.userId,
        conversationId: context.conversationId,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        content: `${skillContent}\n\nUser request:\n${topic}`,
      });

      if (!result.success || !result.reply) {
        return { success: false, reply: 'Learning plan generation failed via unified query engine.' };
      }

      return {
        success: true,
        reply: result.reply,
        outputFiles: result.generatedFiles,
        metadata: { model: result.model ?? llmConfig.model },
      };
    }

    return { success: false, reply: 'Learning plan execution requires AgentService.' };
  },
};

const developWebGameSkill: BuiltinSkillDefinition = {
  name: 'develop-web-game',
  description: 'Build visual/interactive programs in small steps. Trigger on ANY request whose subject has a spatial, temporal, structural, or quantitative dimension that benefits from visual presentation. This includes web games, interactive diagrams, simulations, data dashboards, generative art, UI prototypes.',
  category: 'generation',
  parameters: [
    { name: 'description', description: 'Description of the visual/interactive program to build', required: true },
  ],
  requiresLlm: true,
  handler: async (args, context) => {
    const description = args.trim();
    if (!description) {
      return {
        success: false,
        reply: 'Please provide a description of what to build. Usage: /develop-web-game <description>'
      };
    }

    const llmConfig = context?.llmConfig;
    if (!llmConfig?.apiKey || !llmConfig?.baseUrl) {
      return {
        success: false,
        reply: 'Web game development skill requires LLM configuration. Please set your API key in Settings first.',
      };
    }

    // Load the skill content
    const skillContent = await loadSkillContent('develop-web-game');
    if (!skillContent) {
      return {
        success: false,
        reply: 'Failed to load develop-web-game skill content. Please ensure skills/develop-web-game/SKILL.md exists.',
      };
    }

    skillLogger.info('develop-web-game', `Skill content loaded (${skillContent.length} chars), invoking LLM...`);

    if (context?.runUnifiedPrompt) {
      const result = await context.runUnifiedPrompt({
        userId: context.userId,
        conversationId: context.conversationId,
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        content: `${skillContent}\n\nUser request:\n${description}`,
      });

      if (!result.success || !result.reply) {
        skillLogger.error('develop-web-game', 'LLM call failed', { success: result.success, replyLength: result.reply?.length ?? 0 });
        return { success: false, reply: 'Web game development failed via unified query engine.' };
      }

      skillLogger.info('develop-web-game', `LLM reply received (${result.reply.length} chars)`);
      skillLogger.info('develop-web-game', `Reply tail (last 500 chars):`, result.reply.slice(-500));

      // Parse the OUTPUT_ARTIFACT line from AI's response
      const artifact = parseOutputArtifact(result.reply);
      skillLogger.info('develop-web-game', `OUTPUT_ARTIFACT parsed:`, artifact ?? 'NOT FOUND');

      const cleanReply = artifact ? stripArtifactLine(result.reply) : result.reply;

      const response: SkillHandlerResult = {
        success: true,
        reply: cleanReply,
        metadata: { model: result.model ?? llmConfig.model },
      };

      if (result.generatedFiles?.length) {
        response.outputFiles = result.generatedFiles.map((file) => ({
          ...file,
          title: file.title ?? artifact?.description ?? description,
        }));
        skillLogger.info(
          'develop-web-game',
          `Using ${response.outputFiles.length} generated file(s) reported by AgentService.`,
        );
      } else if (artifact && artifact.url) {
        // AI wrote files to disk and reported the path
        const originalPath = artifact.url;
        const kind = artifact.type;
        skillLogger.info('develop-web-game', `Artifact found: kind=${kind} path=${originalPath}`);

        if (isHttpUrl(originalPath)) {
          response.outputFiles = [{
            url: originalPath,
            kind,
            title: artifact.description ?? description,
          }];
        } else if (context.userId) {
          try {
            const targetPath = await copyGeneratedArtifactToUserDir(originalPath, kind, context.userId);
            skillLogger.info('develop-web-game', `Artifact copied to: ${targetPath}`);

            response.outputFiles = [{
              path: targetPath,
              kind,
              title: artifact.description ?? description,
            }];
          } catch (err: any) {
            skillLogger.error('develop-web-game', `Failed to copy file: ${err.message}`);
            // Fallback: use original path
            response.outputFiles = [{
              path: originalPath,
              kind,
              title: artifact.description ?? description,
            }];
          }
        } else {
          response.outputFiles = [{
            path: originalPath,
            kind,
            title: artifact.description ?? description,
          }];
        }
      } else {
        // Fallback: try to find a file path in the reply (e.g., "/path/to/snake.html")
        const fallbackPath = extractFilePathFromReply(result.reply);
        if (fallbackPath && context.userId) {
          skillLogger.info('develop-web-game', `Fallback path detected: ${fallbackPath}`);
          const kind: OutputArtifactKind = fallbackPath.endsWith('.html') ? 'html' : 'app';

          try {
            const targetPath = await copyGeneratedArtifactToUserDir(fallbackPath, kind, context.userId);
            skillLogger.info('develop-web-game', `Fallback artifact copied to: ${targetPath}`);

            response.outputFiles = [{
              path: targetPath,
              kind,
              title: description,
            }];
          } catch (err: any) {
            skillLogger.error('develop-web-game', `Failed to copy fallback file: ${err.message}`);
            // Use original path as last resort
            response.outputFiles = [{
              path: fallbackPath,
              kind,
              title: description,
            }];
          }
        } else {
          skillLogger.warn('develop-web-game', 'No artifact path found in AI reply. Last 300 chars:', result.reply.slice(-300));
        }
      }

      if (response.outputFiles?.length) {
        skillLogger.info('develop-web-game', 'Returning outputFiles:', response.outputFiles);
      } else {
        skillLogger.warn(
          'develop-web-game',
          'The first execution did not produce a generated artifact; retrying once.',
        );
        const retryResult = await context.runUnifiedPrompt({
          userId: context.userId,
          conversationId: context.conversationId,
          apiKey: llmConfig.apiKey,
          baseUrl: llmConfig.baseUrl,
          model: llmConfig.model,
          content:
            `${skillContent}\n\nUser request:\n${description}\n\n` +
            'The previous execution did not create a usable artifact. Complete the task now: ' +
            'write a self-contained HTML file with the available file tools, verify that it exists, ' +
            'and do not stop after only describing the plan.',
        });

        if (retryResult.success && retryResult.reply) {
          response.reply = retryResult.reply;
          response.metadata = { model: retryResult.model ?? llmConfig.model };
          if (retryResult.generatedFiles?.length) {
            response.outputFiles = retryResult.generatedFiles.map((file) => ({
              ...file,
              title: file.title ?? description,
            }));
          }
        }
      }

      if (!response.outputFiles?.length) {
        return {
          success: false,
          reply: 'Web game generation stopped before producing a usable artifact. Please retry.',
          metadata: response.metadata,
        };
      }

      return response;
    }

    return { success: false, reply: 'Web game development execution requires AgentService.' };
  },
};

const builtinSkills: BuiltinSkillDefinition[] = [
  codeAnalysisSkill,
  imageGenerationSkill,
  videoGenerationSkill,
  learningPlanSkill,
  developWebGameSkill,
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
