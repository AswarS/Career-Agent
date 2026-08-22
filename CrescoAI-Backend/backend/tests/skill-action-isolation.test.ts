import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AssistantMessage } from '../src/types/message.js'
import type { Tool, ToolUseContext } from '../src/Tool.js'
import type { CanUseToolFn } from '../src/hooks/useCanUseTool.js'
import { createRestrictedSkillActionCanUseTool } from '../src/skills/skillActionIsolation.js'

const tempRoots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'skill-action-isolation-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })),
  )
})

function context(workspaceDir: string): ToolUseContext {
  return {
    actionArtifactRuntime: {
      workspaceDir,
      sessionId: 'session-test',
      userId: '1',
    },
  } as ToolUseContext
}

function pathTool(name: string): Tool {
  return {
    name,
    getPath(input: Record<string, unknown>) {
      return String(input.path ?? '')
    },
  } as Tool
}

function shellTool(name: 'Bash' | 'PowerShell'): Tool {
  return { name } as Tool
}

const assistantMessage = {} as AssistantMessage

describe('Action Skill child filesystem isolation', () => {
  test('allows a workspace path and still calls the parent permission layer', async () => {
    const workspace = await tempRoot()
    let parentCalls = 0
    const parent: CanUseToolFn = async (_tool, input) => {
      parentCalls += 1
      return { behavior: 'allow', updatedInput: input }
    }
    const restricted = createRestrictedSkillActionCanUseTool(parent)

    const decision = await restricted(
      pathTool('Read'),
      { path: join(workspace, 'evidence.md') },
      context(workspace),
      assistantMessage,
      'tool-1',
    )

    expect(decision.behavior).toBe('allow')
    expect(parentCalls).toBe(1)
  })

  test('denies paths outside the user workspace before parent permissions', async () => {
    const workspace = await tempRoot()
    const outside = await tempRoot()
    let parentCalls = 0
    const restricted = createRestrictedSkillActionCanUseTool(async () => {
      parentCalls += 1
      return { behavior: 'allow', updatedInput: {} }
    })

    const decision = await restricted(
      pathTool('Read'),
      { path: join(outside, 'private.md') },
      context(workspace),
      assistantMessage,
      'tool-2',
    )

    expect(decision.behavior).toBe('deny')
    expect(parentCalls).toBe(0)
  })

  test('denies a symlink escape from inside the workspace', async () => {
    const workspace = await tempRoot()
    const outside = await tempRoot()
    const link = join(workspace, 'outside-link')
    await symlink(outside, link)
    const restricted = createRestrictedSkillActionCanUseTool(async (_tool, input) => ({
      behavior: 'allow',
      updatedInput: input,
    }))

    const decision = await restricted(
      pathTool('Read'),
      { path: join(link, 'secret.md') },
      context(workspace),
      assistantMessage,
      'tool-3',
    )

    expect(decision.behavior).toBe('deny')
  })

  test('denies the service-only learning state for file and shell tools', async () => {
    const workspace = await tempRoot()
    const restricted = createRestrictedSkillActionCanUseTool(async (_tool, input) => ({ behavior: 'allow', updatedInput: input }))
    const fileDecision = await restricted(pathTool('Read'), { path: join(workspace, '.state', 'learning_state.json') }, context(workspace), assistantMessage, 'state-read')
    const shellDecision = await restricted(shellTool('Bash'), { command: `sed -n 1,20p ${join(workspace, '.state', 'learning_state.json')}` }, context(workspace), assistantMessage, 'state-shell')
    expect(fileDecision.behavior).toBe('deny')
    expect(shellDecision.behavior).toBe('deny')
  })

  test('revalidates a path rewritten by the parent permission layer', async () => {
    const workspace = await tempRoot()
    const outside = await tempRoot()
    const restricted = createRestrictedSkillActionCanUseTool(async () => ({
      behavior: 'allow',
      updatedInput: { path: join(outside, 'rewritten.md') },
    }))

    const decision = await restricted(
      pathTool('Write'),
      { path: join(workspace, 'draft.md') },
      context(workspace),
      assistantMessage,
      'tool-4',
    )

    expect(decision.behavior).toBe('deny')
  })

  test('denies shell paths outside the workspace', async () => {
    const workspace = await tempRoot()
    const outside = await tempRoot()
    const restricted = createRestrictedSkillActionCanUseTool(async (_tool, input) => ({
      behavior: 'allow',
      updatedInput: input,
    }))

    const decision = await restricted(
      shellTool('Bash'),
      { command: `sed -n 1,20p ${join(outside, 'secret.md')}` },
      context(workspace),
      assistantMessage,
      'tool-5',
    )

    expect(decision.behavior).toBe('deny')
  })

  test('denies cwd mutation tools for every Action Skill', async () => {
    const workspace = await tempRoot()
    const restricted = createRestrictedSkillActionCanUseTool(async (_tool, input) => ({
      behavior: 'allow',
      updatedInput: input,
    }))

    const decision = await restricted(
      { name: 'EnterWorktree' } as Tool,
      {},
      context(workspace),
      assistantMessage,
      'tool-6',
    )

    expect(decision.behavior).toBe('deny')
  })

  test('delegates non-filesystem tools to the parent permission layer', async () => {
    const workspace = await tempRoot()
    let parentCalls = 0
    const restricted = createRestrictedSkillActionCanUseTool(async (_tool, input) => {
      parentCalls += 1
      return { behavior: 'allow', updatedInput: input }
    })

    const decision = await restricted(
      { name: 'WebSearch' } as Tool,
      { query: 'official documentation' },
      context(workspace),
      assistantMessage,
      'tool-7',
    )

    expect(decision.behavior).toBe('allow')
    expect(parentCalls).toBe(1)
  })
})
