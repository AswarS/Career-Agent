import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'
import { discoverGeneratedFiles } from '../src/Network/modules/agent/generated-output-discovery.js'
import { getGeneratedSkillActionTools } from '../src/tools/generatedSkillActionTools.js'
import {
  buildWebAppDevChildContext,
  createWebAppStagingDirectory,
  nextLineageFromBase,
  publishStagedWebApp,
  resolveBaseAppLineage,
  validateDeliveredWebAppOutput,
  WebAppDevTool,
  webAppDevResultSchema,
} from '../src/tools/WebAppDevTool/WebAppDevTool.js'
import { bindTrustedInformationRequest } from '../src/tools/WebAppInformationCollectionTool/WebAppInformationCollectionTool.js'
import { buildDevelopWebGameChildContext } from '../src/tools/DevelopWebGameTool/DevelopWebGameTool.js'
import {
  findPlaywrightBrowserExecutable,
  validatePlaywrightAppDirectory,
} from '../src/tools/WebAppPlaywrightTool/WebAppPlaywrightTool.js'
import { ReturnSkillResultTool } from '../src/tools/ReturnSkillResultTool/ReturnSkillResultTool.js'
import { validateSkillResultContract } from '../src/skills/skillResultValidation.js'

const temporaryRoots: string[] = []

const validBrief = {
  schema: 'multi-agent-app-brief/1.0',
  invocation: {
    requestedBy: 'app-coordinator',
    reason: 'Practice needs feedback.',
  },
  user: { audience: 'learner', level: 'unknown', constraints: [] },
  goal: {
    outcome: 'Complete one practice round.',
    successCriteria: ['One round completed.'],
  },
  content: {
    domain: 'fractions',
    required: ['addition'],
    excluded: [],
    sourceNotes: [],
  },
  experience: {
    scene: 'practice',
    primaryLoop: 'answer -> feedback -> retry',
    requiredInteractions: ['answer', 'retry'],
    completionState: 'Round completed.',
  },
  adaptation: { signals: [], allowedResponses: [], forbiddenInferences: [] },
  telemetry: {
    events: ['attempt_submitted'],
    agentQuestions: ['Was the attempt correct?'],
    retention: 'local-session',
    upload: { endpoint: './events' },
  },
  delivery: {
    title: 'Fraction practice',
    slug: 'fraction-practice',
    language: 'en',
    offline: true,
  },
} as const

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(path => rm(path, { recursive: true, force: true })),
  )
})

describe('WebAppDev Tool facade', () => {
  test('publishes only the facade Action Tool in the generated registry', () => {
    const names = getGeneratedSkillActionTools().map(tool => tool.name)
    expect(names).toContain('WebAppDev')
    expect(names).not.toContain('DevelopWebGame')
    expect(names).not.toContain('WebAppInformationCollection')
    expect(names).not.toContain('WebAppPlaywright')
  })

  test('builds one dedicated Agent context and loads renderer instructions without nesting', async () => {
    const context = {
      actionArtifactRuntime: {
        workspaceDir: '/trusted/workspace',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      options: {
        tools: [
          { name: 'Read' },
          { name: 'Bash' },
          { name: 'Agent' },
          { name: 'Skill' },
          { name: 'WebAppDev' },
        ],
      },
    } as unknown as ToolUseContext
    const child = buildWebAppDevChildContext(
      context,
      '/trusted/workspace/.webapp-staging/web-app-one',
    )
    expect(child.options.tools.map(tool => tool.name).sort()).toEqual([
      'Bash',
      'Read',
      'WebAppLoadSkill',
      'WebAppPlaywright',
    ])
    expect(context.options.tools.map(tool => tool.name)).toEqual([
      'Read',
      'Bash',
      'Agent',
      'Skill',
      'WebAppDev',
    ])
    const loader = child.options.tools.find(
      tool => tool.name === 'WebAppLoadSkill',
    )
    expect(
      loader?.inputSchema.safeParse({
        skill: 'develop-web-game',
        app_brief: validBrief,
      }).success,
    ).toBe(true)
    const encodedBrief = loader?.inputSchema.safeParse({
      skill: 'develop-web-game',
      app_brief: JSON.stringify(validBrief),
    })
    expect(encodedBrief?.success).toBe(true)
    if (encodedBrief?.success && encodedBrief.data.skill === 'develop-web-game') {
      expect(encodedBrief.data.app_brief).toEqual(validBrief)
    }
    expect(
      loader?.inputSchema.safeParse({
        skill: 'develop-web-game',
        app_brief: { schema: 'multi-agent-app-brief/1.0' },
      }).success,
    ).toBe(false)
    const loaded = await (loader as any).call(
      { skill: 'develop-web-game', app_brief: validBrief },
      context,
    )
    expect(loaded.data.loaded).toBe(true)
    expect(loaded.data.instructions).toContain(
      '# Visual & Interactive Development',
    )
    expect(loaded.data.instructions).toContain('"execution_mode":"in-context"')
    expect(loaded.data.instructions).toContain(
      '"output_dir":"/trusted/workspace/.webapp-staging/web-app-one"',
    )

    const loadedFromEncodedBrief = await (loader as any).call(
      loader?.inputSchema.parse({
        skill: 'develop-web-game',
        app_brief: JSON.stringify(validBrief),
      }),
      context,
    )
    expect(loadedFromEncodedBrief.data.instructions).toContain(
      '"schema":"multi-agent-app-brief/1.0"',
    )
    expect(loadedFromEncodedBrief.data.instructions).not.toContain(
      '"app_brief":"{',
    )

    const collected = await (loader as any).call(
      {
        skill: 'information-collection',
        information_request: {
          schema: 'multi-agent-information-request/1.0',
          requestId: 'request-1',
          requestedBy: 'app-coordinator',
          returnTo: 'app-coordinator',
          purpose: 'complete-app-brief',
          userId: 'spoofed-user',
          missing: [
            {
              id: 'audience-level',
              path: 'user.level',
              reason: 'Changes the practice difficulty.',
              question: 'What level should this target?',
              required: true,
              acceptableSources: ['conversation', 'profile'],
            },
          ],
          constraints: {
            maxQuestions: 1,
            allowedSources: ['conversation', 'profile'],
            readOnly: true,
            forbiddenInferences: ['Do not infer ability from age.'],
          },
        },
      },
      context,
    )
    expect(collected.data.loaded).toBe(true)
    expect(collected.data.instructions).toContain('# User Information Collection')
    expect(collected.data.instructions).toContain('"userId":"user-1"')
    expect(collected.data.instructions).not.toContain('"userId":"spoofed-user"')
  })

  test('injects a path-bound Playwright Tool only into the renderer child', () => {
    const context = {
      actionArtifactRuntime: {
        workspaceDir: '/trusted/workspace',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      options: { tools: [] },
    } as unknown as ToolUseContext
    const child = buildDevelopWebGameChildContext(
      context,
      '/trusted/workspace/app_generated/web-app-one',
    )
    const playwright = child.options.tools.find(
      tool => tool.name === 'WebAppPlaywright',
    )

    expect(playwright).toBeDefined()
    expect(context.options.tools).toEqual([])
    expect(
      playwright?.inputSchema.safeParse({
        actions: { steps: [{ buttons: ['right'], frames: 3 }] },
      }).success,
    ).toBe(true)
    expect(
      playwright?.inputSchema.safeParse({
        actions: {
          steps: [
            { selector: '#answer', action: 'click' },
            { selector: '#explanation', action: 'fill', value: 'reason' },
            { selector: '#submit', action: 'press', value: 'Enter' },
          ],
        },
      }).success,
    ).toBe(true)
    expect(JSON.stringify(playwright?.inputSchema)).not.toContain('url')
    expect(JSON.stringify(playwright?.inputSchema)).not.toContain('output_dir')
  })

  test('binds authenticated identity over any model-supplied userId', () => {
    expect(
      bindTrustedInformationRequest(
        { schema: 'multi-agent-information-request/1.0', userId: 'spoofed' },
        'user-42',
      ),
    ).toEqual({
      schema: 'multi-agent-information-request/1.0',
      userId: 'user-42',
    })
    expect(() => bindTrustedInformationRequest({}, null)).toThrow(
      'MISSING_TRUSTED_USER_ID',
    )
  })

  test('allocates renderer output below the private staging root', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-output-'))
    temporaryRoots.push(workspace)
    const output = createWebAppStagingDirectory(workspace)
    expect(output.startsWith(resolve(workspace, '.webapp-staging'))).toBe(true)
  })

  test('cleans its private staging directory when a base app ref is invalid', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-cleanup-'))
    temporaryRoots.push(workspace)
    const context = {
      actionArtifactRuntime: {
        workspaceDir: workspace,
        sessionId: 'session-1',
        userId: 'user-1',
      },
      options: { tools: [] },
      abortController: new AbortController(),
    } as unknown as ToolUseContext

    await expect(
      (WebAppDevTool as any).call(
        { request: 'iterate', base_app_ref: 'web-app-missing' },
        context,
        async () => ({ behavior: 'allow', updatedInput: {} }),
        { message: { id: 'message-1' } },
      ),
    ).rejects.toThrow('INVALID_BASE_APP_REF')
    const stagingRoot = join(workspace, '.webapp-staging')
    expect(await readdir(stagingRoot).catch(() => [])).toEqual([])
  })

  test('reuses the newest complete cached Chromium when the pinned browser is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'web-app-browser-cache-'))
    temporaryRoots.push(root)
    const older = join(root, 'chromium-1000', 'chrome-linux', 'chrome')
    const newer = join(root, 'chromium-1228', 'chrome-linux64', 'chrome')
    await mkdir(resolve(older, '..'), { recursive: true })
    await mkdir(resolve(newer, '..'), { recursive: true })
    await writeFile(older, 'old', 'utf8')
    await writeFile(newer, 'new', 'utf8')

    await expect(findPlaywrightBrowserExecutable([root])).resolves.toBe(newer)
  })

  test('accepts a delivered app only when entry and manifest are valid', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-delivery-'))
    temporaryRoots.push(workspace)
    const directory = join(workspace, 'app_generated', 'web-app-one')
    await mkdir(directory, { recursive: true })
    const entryFile = join(directory, 'index.html')
    const manifestFile = join(directory, 'output.json')
    await writeFile(entryFile, '<!doctype html><title>App</title>', 'utf8')
    await writeFile(
      manifestFile,
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'web-app-one',
        title: 'App',
      }),
      'utf8',
    )

    await expect(
      validateDeliveredWebAppOutput(
        {
          kind: 'app',
          directory,
          entry_file: entryFile,
          manifest_file: manifestFile,
          title: 'App',
        },
        workspace,
      ),
    ).resolves.toBeUndefined()
    await expect(
      validatePlaywrightAppDirectory(directory, workspace),
    ).resolves.toEqual({ appDir: directory, entryFile })
  })

  test('publishes a validated staged app atomically into app_generated', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-publish-'))
    temporaryRoots.push(workspace)
    const stagingDirectory = createWebAppStagingDirectory(workspace)
    await mkdir(stagingDirectory, { recursive: true })
    const output = {
      kind: 'app' as const,
      directory: stagingDirectory,
      entry_file: join(stagingDirectory, 'index.html'),
      manifest_file: join(stagingDirectory, 'output.json'),
      title: 'App',
    }
    await writeFile(
      output.entry_file,
      '<!doctype html><title>App</title>',
      'utf8',
    )
    await writeFile(
      output.manifest_file,
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'test-app',
        title: 'App',
      }),
      'utf8',
    )

    const published = await publishStagedWebApp(
      output,
      workspace,
      stagingDirectory,
    )

    expect(
      published.directory.startsWith(resolve(workspace, 'app_generated')),
    ).toBe(true)
    expect((await stat(published.entry_file)).isFile()).toBe(true)
    await expect(stat(stagingDirectory)).rejects.toThrow()
  })

  test('discovers only fully published apps with a valid manifest and entry file', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-discovery-'))
    temporaryRoots.push(workspace)
    const validDirectory = join(workspace, 'app_generated', 'web-app-valid')
    const missingManifest = join(
      workspace,
      'app_generated',
      'web-app-no-manifest',
    )
    const missingEntry = join(workspace, 'app_generated', 'web-app-no-entry')
    await Promise.all([
      mkdir(validDirectory, { recursive: true }),
      mkdir(missingManifest, { recursive: true }),
      mkdir(missingEntry, { recursive: true }),
    ])
    await writeFile(
      join(validDirectory, 'index.html'),
      '<!doctype html>',
      'utf8',
    )
    await writeFile(
      join(validDirectory, 'output.json'),
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'valid-app',
        title: 'Valid App',
      }),
      'utf8',
    )
    await writeFile(
      join(missingManifest, 'index.html'),
      '<!doctype html>',
      'utf8',
    )
    await writeFile(
      join(missingEntry, 'output.json'),
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'missing-entry',
        title: 'Missing entry',
      }),
      'utf8',
    )

    const discovered = await discoverGeneratedFiles(workspace, 0)
    expect(discovered.map(item => item.path)).toEqual([validDirectory])
    expect(discovered[0]?.title).toBe('Valid App')
  })

  test('resolves a base app lineage and computes the next version', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-lineage-'))
    temporaryRoots.push(workspace)
    const directory = join(workspace, 'app_generated', 'web-app-base1')
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'output.json'),
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'fraction-practice',
        title: '分数加减法练习',
      }),
      'utf8',
    )

    const base = await resolveBaseAppLineage(workspace, 'web-app-base1')
    expect(base).toEqual({
      appSlug: 'fraction-practice',
      version: 1,
      logicalObjectId: 'fraction-practice',
      previousArtifactRef: 'artifact://web-app-base1',
    })
    expect(nextLineageFromBase(base)).toEqual({
      logical_object_type: 'web_app',
      logical_object_id: 'fraction-practice',
      version: 2,
      previous_artifact_ref: 'artifact://web-app-base1',
    })
  })

  test('rejects traversal and manifest-less base app refs', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-lineage-'))
    temporaryRoots.push(workspace)
    await mkdir(join(workspace, 'app_generated', 'web-app-empty'), {
      recursive: true,
    })

    await expect(resolveBaseAppLineage(workspace, '../escape')).rejects.toThrow(
      'INVALID_BASE_APP_REF',
    )
    await expect(
      resolveBaseAppLineage(workspace, 'web-app-empty'),
    ).rejects.toThrow('INVALID_BASE_APP_REF')
    await expect(
      resolveBaseAppLineage(workspace, 'web-app-missing'),
    ).rejects.toThrow('INVALID_BASE_APP_REF')
  })

  test('enforces the expected lineage on iterated deliveries', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-lineage-'))
    temporaryRoots.push(workspace)
    const directory = join(workspace, 'app_generated', 'web-app-next')
    await mkdir(directory, { recursive: true })
    const entryFile = join(directory, 'index.html')
    const manifestFile = join(directory, 'output.json')
    await writeFile(entryFile, '<!doctype html>', 'utf8')
    await writeFile(
      manifestFile,
      JSON.stringify({
        schema: 'web-app-manifest/1.0',
        app_slug: 'fraction-practice',
        title: '分数加减法练习',
        lineage: {
          logical_object_type: 'web_app',
          logical_object_id: 'fraction-practice',
          version: 2,
          previous_artifact_ref: 'artifact://web-app-base1',
        },
      }),
      'utf8',
    )
    const output = {
      kind: 'app' as const,
      directory,
      entry_file: entryFile,
      manifest_file: manifestFile,
    }

    await expect(
      validateDeliveredWebAppOutput(output, workspace, {
        logical_object_type: 'web_app',
        logical_object_id: 'fraction-practice',
        version: 2,
        previous_artifact_ref: 'artifact://web-app-base1',
      }),
    ).resolves.toBeUndefined()
    await expect(
      validateDeliveredWebAppOutput(output, workspace, {
        logical_object_type: 'web_app',
        logical_object_id: 'fraction-practice',
        version: 3,
        previous_artifact_ref: 'artifact://web-app-base1',
      }),
    ).rejects.toThrow('lineage must match the base app iteration')
    await expect(
      validateDeliveredWebAppOutput(output, workspace),
    ).resolves.toBeUndefined()
  })

  test('rejects lexical and symlink escapes from app_generated', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'web-app-escape-'))
    const outside = await mkdtemp(join(tmpdir(), 'web-app-outside-'))
    temporaryRoots.push(workspace, outside)
    await mkdir(join(workspace, 'app_generated'), { recursive: true })
    await writeFile(join(outside, 'index.html'), '<!doctype html>', 'utf8')
    await writeFile(join(outside, 'output.json'), '{}', 'utf8')

    await expect(
      validateDeliveredWebAppOutput(
        {
          kind: 'app',
          directory: outside,
          entry_file: join(outside, 'index.html'),
          manifest_file: join(outside, 'output.json'),
        },
        workspace,
      ),
    ).rejects.toThrow('directory must be below app_generated')

    const linkedDirectory = join(workspace, 'app_generated', 'linked-app')
    await symlink(outside, linkedDirectory, 'dir')
    await expect(
      validateDeliveredWebAppOutput(
        {
          kind: 'app',
          directory: linkedDirectory,
          entry_file: join(linkedDirectory, 'index.html'),
          manifest_file: join(linkedDirectory, 'output.json'),
        },
        workspace,
      ),
    ).rejects.toThrow('resolves outside app_generated')
    await expect(
      validatePlaywrightAppDirectory(linkedDirectory, workspace),
    ).rejects.toThrow('resolves outside approved app roots')
  })

  test('validates every coordinator terminal result variant', () => {
    const values = [
      {
        schema: 'web-app-dev-result/1.0',
        status: 'no_app',
        reason: 'Prose is sufficient.',
      },
      {
        schema: 'web-app-dev-result/1.0',
        status: 'needs_user_input',
        request_id: 'request-1',
        missing_set_id: 'goal.successCriteria',
        questions: ['What observable result should count as success?'],
        missing: [
          { path: 'goal.successCriteria', reason: 'Required for completion.' },
        ],
      },
      {
        schema: 'web-app-dev-result/1.0',
        status: 'error',
        code: 'renderer_failed',
        message: 'Renderer failed.',
      },
    ]
    for (const value of values) {
      expect(() => webAppDevResultSchema.parse(value)).not.toThrow()
    }
  })

  test('decodes JSON-encoded Skill results and validates the coordinator contract', async () => {
    const delivered = {
      schema: 'web-app-dev-result/1.0',
      status: 'delivered',
      output: {
        kind: 'app',
        directory: '/trusted/workspace/app_generated/web-app-one',
        entry_file:
          '/trusted/workspace/app_generated/web-app-one/index.html',
        manifest_file:
          '/trusted/workspace/app_generated/web-app-one/output.json',
        title: 'App',
      },
    }
    const parsed = ReturnSkillResultTool.inputSchema.parse({
      skill_call_id: 'call-1',
      skill_name: 'app-coordinator',
      outcome: 'success',
      summary: 'done',
      result: JSON.stringify(delivered),
    })
    expect(parsed.result).toEqual(delivered)
    await expect(
      validateSkillResultContract({
        skillName: 'app-coordinator',
        outcome: 'success',
        result: delivered,
      }),
    ).resolves.toEqual({ ok: true })
    await expect(
      validateSkillResultContract({
        skillName: 'app-coordinator',
        outcome: 'success',
        result: { ...delivered, output: undefined } as any,
      }),
    ).resolves.toMatchObject({ ok: false })
  })
})
