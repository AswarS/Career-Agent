import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { executeSkillAction, getSkillActionCommand } from '../../skills/skillAction.js'
import { registerSkillResultValidator } from '../../skills/skillResultValidation.js'
import {
  assertActionArtifactPublished,
  publishActionArtifact,
  toPublicActionArtifactPublication,
} from '../../artifacts/actionArtifactPublisher.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  TailoredResumeArtifactAdapter,
  validateTailoredResumeSkillResult,
} from './artifactAdapter.js'

const SKILL_NAME = 'tailored-resume-generator' as const

registerSkillResultValidator(SKILL_NAME, input =>
  input.outcome === 'success'
    ? validateTailoredResumeSkillResult(input.result)
    : { ok: true },
)

const inputSchema = lazySchema(() => z.strictObject({
  application_materials: z.json().optional().describe('Optional structured resume source material.'),
  resume_draft: z.string().trim().min(1).optional().describe('Optional existing resume text to optimize.'),
  career_direction_exploration_results: z.json().optional().describe('Optional target career direction requirements.'),
  target_opportunity: z.json().optional().describe('Optional target job description. Omit it to generate a general base resume.'),
  user_profile: z.json().optional().describe('Confirmed Profile facts; this may be the sole source for a base resume.'),
  format_preferences: z.json().optional().describe('Optional language, length, heading, and layout preferences.'),
}))
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() => z.strictObject({
  skill_call_id: z.string(),
  skill_name: z.literal(SKILL_NAME),
  agent_id: z.string(),
  execution_status: z.literal('completed'),
  outcome: z.enum(['success', 'insufficient_input', 'error']),
  summary: z.string(),
  result: z.json().optional(),
  completed_at: z.string(),
  duration_ms: z.number(),
  artifact: z.strictObject({
    artifact_uid: z.string(),
    artifact_ref: z.string(),
    artifact_type: z.string(),
    schema_version: z.string(),
    status: z.enum(['ready', 'canonical_only', 'error']),
    render_mode: z.literal('html').optional(),
    error: z.string().optional(),
  }).optional(),
}))
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const TailoredResumeGeneratorTool = buildTool({
  name: 'TailoredResumeGenerator',
  searchHint: 'generate a base resume from Profile facts or optimize a downloadable resume for a target role',
  maxResultSizeChars: 100_000,
  strict: true,
  alwaysLoad: false,
  shouldDefer: true,
  async description() { return (await getSkillActionCommand(SKILL_NAME)).description },
  async prompt() { return (await getSkillActionCommand(SKILL_NAME)).description },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  userFacingName() { return '生成或优化定制简历' },
  isEnabled() { return true },
  isConcurrencySafe() { return false },
  isReadOnly() { return false },
  toAutoClassifierInput(input) { return JSON.stringify(input) },
  async checkPermissions(input) { return { behavior: 'allow', updatedInput: input } },
  renderToolUseMessage() { return '生成或优化定制简历' },
  renderToolUseRejectedMessage() { return '简历生成已取消' },
  renderToolUseErrorMessage() { return '简历生成失败' },
  renderToolUseProgressMessage() { return '正在生成并发布简历' },
  renderToolResultMessage(output) { return output.summary },
  async call(input, context, canUseTool) {
    const runtime = context.actionArtifactRuntime
    if (!runtime?.userId) {
      throw new Error('ARTIFACT_ACCESS_DENIED: Authenticated user workspace required')
    }
    const completion = await executeSkillAction({
      skillName: SKILL_NAME,
      actionInput: Object.keys(input).length ? input : undefined,
      context,
      canUseTool,
    })
    const artifact = await publishActionArtifact({
      completion,
      adapter: TailoredResumeArtifactAdapter,
      workspaceDir: runtime.workspaceDir,
      sessionId: runtime.sessionId,
      userId: runtime.userId,
    })
    assertActionArtifactPublished(completion, artifact)
    const { result: _internalResult, ...publicCompletion } = completion
    const data: Output = {
      ...publicCompletion,
      skill_name: SKILL_NAME,
      ...(artifact
        ? {
            artifact: toPublicActionArtifactPublication(artifact),
            result: { artifact_ref: artifact.artifact_ref },
          }
        : completion.result !== undefined
          ? { result: completion.result }
          : {}),
    }
    return { data }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string): ToolResultBlockParam {
    return { type: 'tool_result', tool_use_id: toolUseID, content: JSON.stringify(content) }
  },
} satisfies ToolDef<InputSchema, Output>)
