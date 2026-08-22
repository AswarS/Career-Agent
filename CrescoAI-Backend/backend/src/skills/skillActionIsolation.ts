import type { Tool, ToolUseContext } from '../Tool.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { getSessionContext } from '../server/SessionContext.js'
import { checkShellCommandWorkspace } from '../server/shellWorkspaceGuard.js'
import { checkSessionWorkspacePath } from '../server/workspaceSecurity.js'
import type { PermissionDecision } from '../utils/permissions/PermissionResult.js'
import { resolve } from 'node:path'

const READ_PATH_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS'])
const WRITE_PATH_TOOLS = new Set([
  'Write',
  'Edit',
  'FileEdit',
  'MultiEdit',
  'NotebookEdit',
])
const CWD_MUTATION_TOOLS = new Set(['EnterWorktree', 'ExitWorktree'])

function deny(message: string): PermissionDecision {
  return {
    behavior: 'deny',
    message,
    decisionReason: {
      type: 'workingDir',
      reason: message,
    },
  }
}

function actionWorkspaceRoot(context: ToolUseContext): string | undefined {
  return (
    context.actionArtifactRuntime?.workspaceDir ??
    getSessionContext()?.config.workspaceRoot
  )
}

async function checkPathTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
): Promise<PermissionDecision | null> {
  const access = READ_PATH_TOOLS.has(tool.name)
    ? 'read'
    : WRITE_PATH_TOOLS.has(tool.name)
      ? 'write'
      : null
  if (!access) return null

  const workspaceRoot = actionWorkspaceRoot(context)
  if (!workspaceRoot) {
    return deny('Action Skill filesystem access requires a user workspace')
  }

  let path: string
  try {
    const candidate = tool.getPath?.(input as never)
    if (typeof candidate !== 'string' || !candidate) {
      return deny(`Tool "${tool.name}" did not provide a valid path`)
    }
    path = candidate
  } catch {
    return deny(`Tool "${tool.name}" path validation failed`)
  }

  const session = getSessionContext()
  const serviceOnlyRoots = [
    { id: 'learning-state', root: resolve(workspaceRoot, '.state') },
    ...(session?.config.serviceOnlyRoots ?? []),
  ]
  const boundary = await checkSessionWorkspacePath(path, access, {
    cwd: workspaceRoot,
    workspaceRoot,
    toolName: tool.name,
    // Service-only denies remain in force. Parent user/shared/memory/skill
    // roots are intentionally not inherited by Action Skill children.
    serviceOnlyRoots,
  })
  if (boundary.allowed || !('reason' in boundary)) return null
  return deny(
    boundary.rootId
      ? `${boundary.reason} [root=${boundary.rootId}]`
      : boundary.reason,
  )
}

async function checkShellTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
): Promise<PermissionDecision | null> {
  if (tool.name !== 'Bash' && tool.name !== 'PowerShell') return null

  const workspaceRoot = actionWorkspaceRoot(context)
  if (!workspaceRoot) {
    return deny('Action Skill shell access requires a user workspace')
  }
  if (input.dangerouslyDisableSandbox === true) {
    return deny('Sandbox overrides are not allowed for Action Skills')
  }
  if (typeof input.command !== 'string') {
    return deny('Shell command is missing')
  }

  const boundary = await checkShellCommandWorkspace(
    input.command,
    tool.name === 'Bash' ? 'bash' : 'powershell',
    { cwd: workspaceRoot, workspaceRoot, serviceOnlyRoots: [
      { id: 'learning-state', root: resolve(workspaceRoot, '.state') },
      ...(getSessionContext()?.config.serviceOnlyRoots ?? []),
    ] },
  )
  return boundary.allowed || !('reason' in boundary)
    ? null
    : deny(boundary.reason)
}

async function checkActionSkillBoundary(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
): Promise<PermissionDecision | null> {
  if (CWD_MUTATION_TOOLS.has(tool.name)) {
    return deny(`Tool "${tool.name}" cannot change an Action Skill workspace`)
  }
  return (
    (await checkShellTool(tool, input, context)) ??
    (await checkPathTool(tool, input, context))
  )
}

/**
 * Apply the same fail-closed filesystem boundary to every model-entry:
 * action-tool child. The parent permission callback still runs, but it cannot
 * widen the child boundary or rewrite an allowed input to an escaping path.
 */
export function createRestrictedSkillActionCanUseTool(
  parentCanUseTool: CanUseToolFn,
): CanUseToolFn {
  return async (
    tool,
    input,
    context,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    const initialBoundary = await checkActionSkillBoundary(tool, input, context)
    if (initialBoundary) return initialBoundary

    const parentDecision = await parentCanUseTool(
      tool,
      input,
      context,
      assistantMessage,
      toolUseId,
      forceDecision,
    )
    if (parentDecision.behavior !== 'allow') return parentDecision

    const updatedInput = parentDecision.updatedInput ?? input
    const updatedBoundary = await checkActionSkillBoundary(
      tool,
      updatedInput,
      context,
    )
    if (updatedBoundary) return updatedBoundary
    return parentDecision
  }
}
