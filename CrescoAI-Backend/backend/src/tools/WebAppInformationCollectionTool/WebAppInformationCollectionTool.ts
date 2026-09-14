import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  executeSkillAction,
  getSkillActionCommand,
} from '../../skills/skillAction.js'
import type { JsonValue } from '../../skills/skillLifecycleTypes.js'
import { lazySchema } from '../../utils/lazySchema.js'

const SKILL_NAME = 'information-collection' as const

const inputSchema = lazySchema(() =>
  z.strictObject({
    information_request: z.json(),
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

export function bindTrustedInformationRequest(
  value: JsonValue,
  userId: string | null | undefined,
): { [key: string]: JsonValue } {
  if (!userId?.trim()) {
    throw new Error('MISSING_TRUSTED_USER_ID: authenticated runtime userId is required')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_INFORMATION_REQUEST: expected a JSON object')
  }
  return { ...value, userId }
}

/** Internal-only leaf Tool injected into the app-coordinator child context. */
export const WebAppInformationCollectionTool = buildTool({
  name: 'WebAppInformationCollection',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return (await getSkillActionCommand(SKILL_NAME)).description
  },
  async prompt() {
    return 'Resolve only the information paths requested by app-coordinator. The authenticated userId is bound by the Tool.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Web App information collection'
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
  toAutoClassifierInput(input) {
    return JSON.stringify(input)
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage() {
    return 'Resolve Web App information gaps'
  },
  renderToolUseRejectedMessage() {
    return 'Web App information collection rejected'
  },
  renderToolUseErrorMessage() {
    return 'Web App information collection failed'
  },
  renderToolResultMessage(output) {
    return output.summary
  },
  async call(input, context, canUseTool) {
    const informationRequest = bindTrustedInformationRequest(
      input.information_request,
      context.actionArtifactRuntime?.userId,
    )
    const completion = await executeSkillAction({
      skillName: SKILL_NAME,
      actionInput: { information_request: informationRequest },
      context,
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
