import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod/v4'
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js'
import {
  executeSkillAction,
  getSkillActionCommand,
} from '../../skills/skillAction.js'
import { normalizeMessages } from '../../utils/messages.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { SkillToolProgress } from '../../types/tools.js'
import { createWebAppLoadSkillTool } from '../WebAppLoadSkillTool/WebAppLoadSkillTool.js'
import {
  createWebAppPlaywrightTool,
  runWebAppPlaywrightVerification,
} from '../WebAppPlaywrightTool/WebAppPlaywrightTool.js'
import {
  webAppManifestSchema,
  type WebAppManifest,
} from '../../artifacts/webAppManifest.js'
import { registerSkillResultValidator } from '../../skills/skillResultValidation.js'

const SKILL_NAME = 'app-coordinator' as const

const deliveredOutputSchema = z.strictObject({
  kind: z.literal('app'),
  directory: z.string().min(1),
  entry_file: z.string().min(1),
  manifest_file: z.string().min(1),
  title: z.string().min(1).optional(),
})

export const webAppDevResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    schema: z.literal('web-app-dev-result/1.0'),
    status: z.literal('delivered'),
    output: deliveredOutputSchema,
  }),
  z.strictObject({
    schema: z.literal('web-app-dev-result/1.0'),
    status: z.literal('no_app'),
    reason: z.string().min(1),
  }),
  z.strictObject({
    schema: z.literal('web-app-dev-result/1.0'),
    status: z.literal('needs_user_input'),
    request_id: z.string().min(1),
    missing_set_id: z.string().min(1),
    questions: z.array(z.string().min(1)).min(1).max(3),
    missing: z
      .array(
        z.strictObject({
          path: z.string().min(1),
          reason: z.string().min(1),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    schema: z.literal('web-app-dev-result/1.0'),
    status: z.literal('error'),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
])

registerSkillResultValidator(SKILL_NAME, input => {
  const parsed = webAppDevResultSchema.safeParse(input.result)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: `INVALID_WEB_APP_RESULT: ${issue?.path.join('.') || 'result'} ${issue?.message || 'does not match web-app-dev-result/1.0'}`,
    }
  }
  const expected =
    parsed.data.status === 'needs_user_input'
      ? 'insufficient_input'
      : parsed.data.status === 'error'
        ? 'error'
        : 'success'
  return input.outcome === expected
    ? { ok: true }
    : {
        ok: false,
        error: `INVALID_WEB_APP_RESULT: status ${parsed.data.status} requires outcome ${expected}`,
      }
})

const inputSchema = lazySchema(() =>
  z.strictObject({
    request: z.string().trim().min(1),
    // App id (directory basename) of an existing app to iterate on.
    // Obtainable from a previous WebAppDev result's output.directory
    // basename or the path segment after /app/ in the artifact URL.
    base_app_ref: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
      .optional(),
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
    result: webAppDevResultSchema,
    completed_at: z.string(),
    duration_ms: z.number(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function isDescendant(root: string, candidate: string): boolean {
  const relation = relative(root, candidate)
  return relation !== '' && !relation.startsWith('..') && !isAbsolute(relation)
}

export function createWebAppStagingDirectory(workspaceDir: string): string {
  return join(
    resolve(workspaceDir),
    '.webapp-staging',
    `web-app-${randomUUID()}`,
  )
}

export function buildWebAppDevChildContext(
  context: ToolUseContext,
  outputDir: string,
): ToolUseContext {
  const runtime = context.actionArtifactRuntime
  if (!runtime?.workspaceDir) {
    throw new Error(
      'MISSING_WEB_APP_WORKSPACE: a trusted workspace is required',
    )
  }
  const injectedTools = [
    createWebAppLoadSkillTool({
      outputDir,
      trustedUserId: runtime.userId,
    }),
    createWebAppPlaywrightTool({
      outputDir,
      workspaceDir: runtime.workspaceDir,
    }),
  ]
  const allowedNames = new Set([
    'Bash',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'LS',
    'WebSearch',
    'WebFetch',
    'ImageGenerate',
    'profile_read',
    'profile_get_basic',
    'profile_memory_read',
    'ReturnSkillResult',
  ])
  const injectedNames = new Set(injectedTools.map(tool => tool.name))
  return {
    ...context,
    options: {
      ...context.options,
      tools: [
        ...context.options.tools.filter(
          tool => allowedNames.has(tool.name) && !injectedNames.has(tool.name),
        ),
        ...injectedTools,
      ],
    },
  }
}

export type ExpectedLineage = {
  logical_object_type: 'web_app'
  logical_object_id: string
  version: number
  previous_artifact_ref: string
}

export type BaseAppLineage = {
  appSlug: string
  version: number
  logicalObjectId: string
  previousArtifactRef: string
}

/** Read the lineage of an existing app being iterated; throws on bad refs. */
export async function resolveBaseAppLineage(
  workspaceDir: string,
  baseAppRef: string,
): Promise<BaseAppLineage> {
  const generatedRoot = resolve(workspaceDir, 'app_generated')
  const baseDir = resolve(generatedRoot, baseAppRef)
  if (
    !isDescendant(generatedRoot, baseDir) ||
    basename(baseDir) !== baseAppRef
  ) {
    throw new Error(`INVALID_BASE_APP_REF: ${baseAppRef} escapes app_generated`)
  }
  let manifest: WebAppManifest | undefined
  try {
    const raw = JSON.parse(await readFile(join(baseDir, 'output.json'), 'utf8'))
    const parsed = webAppManifestSchema.safeParse(raw)
    if (parsed.success) manifest = parsed.data
  } catch {
    // Reported below as an invalid base app ref.
  }
  const realBase = await realpath(baseDir).catch(() => '')
  const realRoot = await realpath(generatedRoot).catch(() => generatedRoot)
  if (!manifest || !realBase || !isDescendant(realRoot, realBase)) {
    throw new Error(
      `INVALID_BASE_APP_REF: ${baseAppRef} has no valid web-app-manifest`,
    )
  }
  return {
    appSlug: manifest.app_slug,
    version: manifest.lineage?.version ?? 1,
    logicalObjectId: manifest.lineage?.logical_object_id ?? manifest.app_slug,
    previousArtifactRef: `artifact://${baseAppRef}`,
  }
}

export function nextLineageFromBase(base: BaseAppLineage): ExpectedLineage {
  return {
    logical_object_type: 'web_app',
    logical_object_id: base.logicalObjectId,
    version: base.version + 1,
    previous_artifact_ref: base.previousArtifactRef,
  }
}

async function validateWebAppOutputBelow(
  output: z.infer<typeof deliveredOutputSchema>,
  allowedRoot: string,
  expectedLineage?: ExpectedLineage,
  expectedDirectory?: string,
  rootLabel = 'app_generated',
): Promise<void> {
  const generatedRoot = resolve(allowedRoot)
  const directory = resolve(output.directory)
  const entryFile = resolve(output.entry_file)
  const manifestFile = resolve(output.manifest_file)

  if (!isDescendant(generatedRoot, directory)) {
    throw new Error(
      `INVALID_WEB_APP_OUTPUT: directory must be below ${rootLabel}`,
    )
  }
  if (expectedDirectory && directory !== resolve(expectedDirectory)) {
    throw new Error(
      'INVALID_WEB_APP_OUTPUT: directory does not match the assigned output directory',
    )
  }
  if (
    !isDescendant(directory, entryFile) ||
    basename(entryFile) !== 'index.html'
  ) {
    throw new Error(
      'INVALID_WEB_APP_OUTPUT: entry_file must be index.html inside the app directory',
    )
  }
  if (
    !isDescendant(directory, manifestFile) ||
    basename(manifestFile) !== 'output.json'
  ) {
    throw new Error(
      'INVALID_WEB_APP_OUTPUT: manifest_file must be output.json inside the app directory',
    )
  }

  const [
    realGeneratedRoot,
    realDirectory,
    realEntryFile,
    realManifestFile,
    entryStats,
    manifestStats,
  ] = await Promise.all([
    realpath(generatedRoot),
    realpath(directory),
    realpath(entryFile),
    realpath(manifestFile),
    stat(entryFile),
    stat(manifestFile),
  ])
  if (!isDescendant(realGeneratedRoot, realDirectory)) {
    throw new Error(
      `INVALID_WEB_APP_OUTPUT: app directory resolves outside ${rootLabel}`,
    )
  }
  if (!entryStats.isFile() || !manifestStats.isFile()) {
    throw new Error('INVALID_WEB_APP_OUTPUT: entry and manifest must be files')
  }
  if (
    !isDescendant(realDirectory, realEntryFile) ||
    !isDescendant(realDirectory, realManifestFile)
  ) {
    throw new Error(
      'INVALID_WEB_APP_OUTPUT: output files resolve outside the app directory',
    )
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  } catch {
    throw new Error(
      'INVALID_WEB_APP_OUTPUT: output.json must contain valid JSON',
    )
  }
  const manifest = webAppManifestSchema.safeParse(rawManifest)
  if (!manifest.success) {
    throw new Error(
      `INVALID_WEB_APP_OUTPUT: output.json must match web-app-manifest/1.0: ${manifest.error.issues[0]?.message ?? 'invalid manifest'}`,
    )
  }
  if (expectedLineage) {
    const lineage = manifest.data.lineage
    if (
      !lineage ||
      lineage.logical_object_type !== expectedLineage.logical_object_type ||
      lineage.logical_object_id !== expectedLineage.logical_object_id ||
      lineage.version !== expectedLineage.version ||
      lineage.previous_artifact_ref !== expectedLineage.previous_artifact_ref
    ) {
      throw new Error(
        'INVALID_WEB_APP_OUTPUT: output.json lineage must match the base app iteration',
      )
    }
  }
}

export async function validateDeliveredWebAppOutput(
  output: z.infer<typeof deliveredOutputSchema>,
  workspaceDir: string,
  expectedLineage?: ExpectedLineage,
): Promise<void> {
  return validateWebAppOutputBelow(
    output,
    resolve(workspaceDir, 'app_generated'),
    expectedLineage,
  )
}

export async function validateStagedWebAppOutput(
  output: z.infer<typeof deliveredOutputSchema>,
  workspaceDir: string,
  stagingDirectory: string,
  expectedLineage?: ExpectedLineage,
): Promise<void> {
  return validateWebAppOutputBelow(
    output,
    resolve(workspaceDir, '.webapp-staging'),
    expectedLineage,
    stagingDirectory,
    '.webapp-staging',
  )
}

export async function publishStagedWebApp(
  output: z.infer<typeof deliveredOutputSchema>,
  workspaceDir: string,
  stagingDirectory: string,
  expectedLineage?: ExpectedLineage,
): Promise<z.infer<typeof deliveredOutputSchema>> {
  await validateStagedWebAppOutput(
    output,
    workspaceDir,
    stagingDirectory,
    expectedLineage,
  )
  const publishedRoot = resolve(workspaceDir, 'app_generated')
  const publishedDirectory = join(publishedRoot, basename(stagingDirectory))
  await mkdir(publishedRoot, { recursive: true })
  try {
    await stat(publishedDirectory)
    throw new Error('WEB_APP_PUBLISH_COLLISION: destination already exists')
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  await rename(stagingDirectory, publishedDirectory)
  const published = {
    ...output,
    directory: publishedDirectory,
    entry_file: join(publishedDirectory, 'index.html'),
    manifest_file: join(publishedDirectory, 'output.json'),
  }
  try {
    await validateDeliveredWebAppOutput(
      published,
      workspaceDir,
      expectedLineage,
    )
    return published
  } catch (error) {
    await rename(publishedDirectory, stagingDirectory).catch(() => undefined)
    throw error
  }
}

function assertOutcomeMatchesResult(output: Output): void {
  const expected =
    output.result.status === 'needs_user_input'
      ? 'insufficient_input'
      : output.result.status === 'error'
        ? 'error'
        : 'success'
  if (output.outcome !== expected) {
    throw new Error(
      `INVALID_WEB_APP_RESULT: status ${output.result.status} requires outcome ${expected}`,
    )
  }
}

export const WebAppDevTool = buildTool({
  name: 'WebAppDev',
  searchHint: 'build interactive visual simulations practice workspaces',
  maxResultSizeChars: 100_000,
  strict: true,
  alwaysLoad: true,
  async description() {
    return (await getSkillActionCommand(SKILL_NAME)).description
  },
  async prompt() {
    return (
      (await getSkillActionCommand(SKILL_NAME)).description +
      '\n\nIterating an existing App: pass base_app_ref with the app id from a previous WebAppDev result (the basename of output.directory, e.g. web-app-<uuid>, also visible after /app/ in the artifact URL). The new version keeps the same app slug, so saved progress carries over.'
    )
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Web App development'
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
  interruptBehavior() {
    return 'cancel'
  },
  toAutoClassifierInput({ request }) {
    return request
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage() {
    return 'Build and verify Web App'
  },
  renderToolUseRejectedMessage() {
    return 'Web App development rejected'
  },
  renderToolUseErrorMessage() {
    return 'Web App development failed'
  },
  renderToolUseProgressMessage() {
    return 'Building Web App'
  },
  renderToolResultMessage(output) {
    return output.summary
  },
  async call(input, context, canUseTool, parentMessage, onProgress) {
    const runtime = context.actionArtifactRuntime
    if (!runtime?.workspaceDir) {
      throw new Error(
        'MISSING_WEB_APP_WORKSPACE: a trusted workspace is required',
      )
    }
    const stagingDirectory = createWebAppStagingDirectory(runtime.workspaceDir)
    await mkdir(stagingDirectory, { recursive: true })
    let published = false
    let expectedLineage: ExpectedLineage | undefined
    let baseApp:
      | { app_id: string; app_slug: string; versioning: ExpectedLineage }
      | undefined
    try {
      if (input.base_app_ref) {
        const base = await resolveBaseAppLineage(
          runtime.workspaceDir,
          input.base_app_ref,
        )
        const next = nextLineageFromBase(base)
        expectedLineage = next
        baseApp = {
          app_id: input.base_app_ref,
          app_slug: base.appSlug,
          versioning: next,
        }
      }
      const completion = await executeSkillAction({
        skillName: SKILL_NAME,
        actionInput: {
          request: input.request,
          output_dir: stagingDirectory,
          ...(baseApp ? { base_app: baseApp } : {}),
        },
        context: buildWebAppDevChildContext(context, stagingDirectory),
        canUseTool,
        onMessage(message, details) {
          if (
            (message.type !== 'assistant' && message.type !== 'user') ||
            !onProgress
          ) {
            return
          }
          for (const normalized of normalizeMessages([message])) {
            const content = normalized.message.content
            const hasToolContent =
              Array.isArray(content) &&
              content.some(block => {
                if (!block || typeof block !== 'object' || !('type' in block)) {
                  return false
                }
                return block.type === 'tool_use' || block.type === 'tool_result'
              })
            if (!hasToolContent) continue
            onProgress({
              toolUseID: `web-app-dev_${parentMessage.message.id}`,
              data: {
                message: normalized,
                type: 'skill_progress',
                prompt: details.skillContent,
                agentId: details.agentId,
              },
            })
          }
        },
      })

      const data = outputSchema().parse(completion)
      assertOutcomeMatchesResult(data)
      if (data.result.status === 'delivered') {
        await validateStagedWebAppOutput(
          data.result.output,
          runtime.workspaceDir,
          stagingDirectory,
          expectedLineage,
        )
        const verification = await runWebAppPlaywrightVerification({
          outputDir: stagingDirectory,
          workspaceDir: runtime.workspaceDir,
          value: {
            actions: { steps: [{ frames: 1 }] },
            iterations: 1,
            pause_ms: 100,
          },
          context,
        })
        if (verification.status !== 'passed') {
          throw new Error(
            `WEB_APP_VERIFICATION_${verification.status.toUpperCase()}: ${verification.code}: ${verification.diagnostics}`,
          )
        }
        data.result.output = await publishStagedWebApp(
          data.result.output,
          runtime.workspaceDir,
          stagingDirectory,
          expectedLineage,
        )
        published = true
      }
      return { data }
    } finally {
      if (!published) {
        await rm(stagingDirectory, { recursive: true, force: true })
      }
    }
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
} satisfies ToolDef<InputSchema, Output, SkillToolProgress>)
