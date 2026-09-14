import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import {
  buildTool,
  type ToolDef,
  type ToolUseContext,
} from '../../Tool.js'
import {
  executeSkillAction,
  getSkillActionCommand,
} from '../../skills/skillAction.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { createWebAppPlaywrightTool } from '../WebAppPlaywrightTool/WebAppPlaywrightTool.js'
import { webAppBriefToolInputSchema } from '../../artifacts/webAppBrief.js'

const SKILL_NAME = 'develop-web-game' as const

const inputSchema = lazySchema(() =>
  z.strictObject({
    app_brief: webAppBriefToolInputSchema,
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.strictObject({
    skill_call_id: z.string(),
    skill_name: z.literal(SKILL_NAME),
    agent_id: z.string(),
    execution_status: z.literal('completed'),
    outcome: z.enum(['success', 'insufficient_input', 'error']),
    summary: z.string(),
    result: z.json().optional(),
    completed_at: z.string(),
    duration_ms: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export function createWebAppOutputDirectory(workspaceDir: string): string {
  return join(
    resolve(workspaceDir),
    'app_generated',
    `web-app-${randomUUID()}`,
  )
}

export function buildDevelopWebGameChildContext(
  context: ToolUseContext,
  outputDir: string,
): ToolUseContext {
  const workspaceDir = context.actionArtifactRuntime?.workspaceDir
  if (!workspaceDir) {
    throw new Error('MISSING_WEB_APP_WORKSPACE: a trusted workspace is required')
  }
  const playwrightTool = createWebAppPlaywrightTool({
    outputDir,
    workspaceDir,
  })
  return {
    ...context,
    options: {
      ...context.options,
      tools: [
        ...context.options.tools.filter(tool => tool.name !== playwrightTool.name),
        playwrightTool,
      ],
    },
  }
}

/** Internal-only leaf Tool injected into the app-coordinator child context. */
export const DevelopWebGameTool = buildTool({
  name: 'DevelopWebGame',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return (await getSkillActionCommand(SKILL_NAME)).description
  },
  async prompt() {
    return 'Render only the validated App Brief. The Tool supplies the trusted output directory.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Web App renderer'
  },
  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    return JSON.stringify(input)
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage() {
    return 'Render and verify Web App'
  },
  renderToolUseRejectedMessage() {
    return 'Web App renderer rejected'
  },
  renderToolUseErrorMessage() {
    return 'Web App renderer failed'
  },
  renderToolResultMessage(output) {
    return output.summary
  },
  async call(input, context, canUseTool) {
    const workspaceDir = context.actionArtifactRuntime?.workspaceDir
    if (!workspaceDir) {
      throw new Error('MISSING_WEB_APP_WORKSPACE: a trusted workspace is required')
    }
    const outputDir = createWebAppOutputDirectory(workspaceDir)
    const completion = await executeSkillAction({
      skillName: SKILL_NAME,
      actionInput: {
        app_brief: input.app_brief,
        output_dir: outputDir,
      },
      context: buildDevelopWebGameChildContext(context, outputDir),
      canUseTool,
    })
    return { data: outputSchema().parse(completion) }
  },
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: JSON.stringify(content),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
