import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v4'

import { webAppBriefToolInputSchema } from '../../artifacts/webAppBrief.js'
import {
  isServerMode,
  registerSessionSkillReadOnlyRoot,
} from '../../server/SessionContext.js'
import { getGlobalSkillRoot } from '../../skills/globalSkillPaths.js'
import type { JsonValue } from '../../skills/skillLifecycleTypes.js'
import { buildTool, type Tool, type ToolDef } from '../../Tool.js'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { bindTrustedInformationRequest } from '../WebAppInformationCollectionTool/WebAppInformationCollectionTool.js'

const informationRequestSchema = z.strictObject({
  schema: z.literal('multi-agent-information-request/1.0'),
  requestId: z.string().trim().min(1),
  requestedBy: z.literal('app-coordinator'),
  returnTo: z.literal('app-coordinator'),
  purpose: z.literal('complete-app-brief'),
  userId: z.string().optional(),
  missing: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1),
        path: z.string().trim().min(1),
        reason: z.string().trim().min(1),
        question: z.string().trim().min(1),
        required: z.boolean(),
        acceptableSources: z
          .array(z.enum(['conversation', 'profile', 'memory', 'user']))
          .min(1),
      }),
    )
    .min(1)
    .max(32),
  constraints: z.strictObject({
    maxQuestions: z.number().int().min(1).max(3),
    allowedSources: z
      .array(z.enum(['conversation', 'profile', 'memory', 'user']))
      .min(1),
    readOnly: z.literal(true),
    forbiddenInferences: z.array(z.string()).max(32),
  }),
})

const inputSchema = lazySchema(() =>
  z.discriminatedUnion('skill', [
    z.strictObject({
      skill: z.literal('information-collection'),
      information_request: informationRequestSchema,
    }),
    z.strictObject({
      skill: z.literal('develop-web-game'),
      app_brief: webAppBriefToolInputSchema,
    }),
  ]),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.strictObject({
    loaded: z.literal(true),
    skill: z.enum(['information-collection', 'develop-web-game']),
    instructions: z.string().min(1),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function actionInputBlock(value: JsonValue): string {
  return `\n\n<skill-action-input>\n${JSON.stringify(value)}\n</skill-action-input>`
}

async function loadSkillInstructions(
  skillName: 'information-collection' | 'develop-web-game',
  actionInput: JsonValue,
): Promise<string> {
  const skillRoot = getGlobalSkillRoot(skillName)
  const rootRegistered = await registerSessionSkillReadOnlyRoot(skillRoot)
  if (isServerMode() && !rootRegistered) {
    throw new Error(
      `WEB_APP_SKILL_ROOT_DENIED: ${skillName} is outside the trusted Skill catalog`,
    )
  }
  const skillFile = join(skillRoot, 'SKILL.md')
  const source = await readFile(skillFile, 'utf8')
  const { content } = parseFrontmatter(source, skillFile)
  const instructions = content
    .trim()
    .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillRoot)
  return `Base directory for this skill: ${skillRoot}\n\n${instructions}${actionInputBlock(actionInput)}\n\n<web-app-agent-mode>in-context</web-app-agent-mode>`
}

/**
 * Load one of the two peer Web App skills into the current dedicated Agent.
 * This deliberately returns instructions instead of forking another Agent.
 */
export function createWebAppLoadSkillTool(input: {
  outputDir: string
  trustedUserId: string | null | undefined
}): Tool {
  return buildTool({
    name: 'WebAppLoadSkill',
    maxResultSizeChars: 120_000,
    strict: true,
    async description() {
      return 'Load an approved Web App workflow skill into this same dedicated Agent. Use information-collection for scoped evidence resolution and develop-web-game for implementation. Pass app_brief as a JSON object; a JSON-encoded object string is also accepted for provider compatibility.'
    },
    async prompt() {
      return 'Load the next Web App skill in the current Agent. This never starts a child Agent. The renderer output directory and authenticated user identity are bound by the Harness.'
    },
    get inputSchema(): InputSchema {
      return inputSchema()
    },
    get outputSchema(): OutputSchema {
      return outputSchema()
    },
    userFacingName() {
      return 'Load Web App skill'
    },
    isEnabled() {
      return true
    },
    isConcurrencySafe() {
      return false
    },
    isReadOnly() {
      return true
    },
    toAutoClassifierInput(value) {
      return value.skill
    },
    async checkPermissions(value) {
      return { behavior: 'allow', updatedInput: value }
    },
    renderToolUseMessage() {
      return 'Load Web App workflow'
    },
    renderToolUseRejectedMessage() {
      return 'Web App workflow loading rejected'
    },
    renderToolUseErrorMessage() {
      return 'Web App workflow loading failed'
    },
    renderToolResultMessage(output) {
      return `Loaded ${output.skill} in the current Web App Agent`
    },
    async call(value) {
      const actionInput: JsonValue =
        value.skill === 'develop-web-game'
          ? {
              execution_mode: 'in-context',
              app_brief: value.app_brief,
              output_dir: input.outputDir,
            }
          : {
              execution_mode: 'in-context',
              information_request: bindTrustedInformationRequest(
                value.information_request,
                input.trustedUserId,
              ),
            }
      const instructions = await loadSkillInstructions(value.skill, actionInput)
      return {
        data: outputSchema().parse({
          loaded: true,
          skill: value.skill,
          instructions,
        }),
      }
    },
    mapToolResultToToolResultBlockParam(
      content: Output,
      toolUseID: string,
    ): ToolResultBlockParam {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: content.instructions,
      }
    },
  } satisfies ToolDef<InputSchema, Output>)
}
