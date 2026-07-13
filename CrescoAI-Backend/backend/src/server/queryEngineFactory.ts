/**
 * queryEngineFactory.ts — Creates per-session QueryEngine instances for multi-user server mode.
 *
 * This module is the core bridge between the server's SessionContext (ALS-isolated)
 * and the original Claude Code QueryEngine. It constructs a QueryEngineConfig that
 * satisfies all of QueryEngine's dependencies without requiring Ink/React.
 */

import { QueryEngine } from '../QueryEngine.js'
import type { QueryEngineConfig } from '../QueryEngine.js'
import type { SessionContext } from './SessionContext.js'
import type { PermissionConfig } from './permissions.js'
import { checkToolPermission } from './permissions.js'
import type { ToolPermissionContext } from '../Tool.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import type { AppState } from '../state/AppStateStore.js'
import type { DeepImmutable } from '../types/utils.js'
import { getTools, assembleToolPool } from '../tools.js'
import type { Command } from '../commands.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { PermissionDecision } from '../utils/permissions/PermissionResult.js'
import type { Tool } from '../Tool.js'
import type { FileStateCache } from '../utils/fileStateCache.js'
import { CAREER_AGENT_LEARNING_SYSTEM_PROMPT } from '../Network/prompts/careerAgentLearningPrompt.js'
import { getProfileAgentSystemPrompt } from '../Network/modules/profile/profile-agent.prompt.js'
import { checkSessionWorkspacePath } from './workspaceSecurity.js'
import { checkShellCommandWorkspace } from './shellWorkspaceGuard.js'

// ---------------------------------------------------------------------------
// Per-session AppState
// ---------------------------------------------------------------------------

export function createServerAppState(
  permissionConfig?: PermissionConfig,
): { getAppState: () => AppState; setAppState: (f: (prev: AppState) => AppState) => void } {
  const toolPermissionContext = buildToolPermissionContext(permissionConfig)

  // Minimal AppState that satisfies QueryEngine's reads:
  // - toolPermissionContext (for permission checks)
  // - verbose (for logging)
  // - settings (for tool preset filtering)
  // All other fields are initialized to safe defaults.
  let appState = createMinimalAppState(toolPermissionContext)

  return {
    getAppState: () => appState,
    setAppState: (f) => {
      appState = f(appState) as AppState
    },
  }
}

function createMinimalAppState(tpc: ToolPermissionContext): AppState {
  return {
    settings: {
      // Minimal settings — empty defaults, server mode doesn't read user settings
    } as any,
    verbose: false,
    mainLoopModel: { type: 'string', value: '' } as any,
    mainLoopModelForSession: { type: 'string', value: '' } as any,
    statusLineText: undefined,
    expandedView: 'none',
    isBriefOnly: false,
    selectedIPAgentIndex: 0,
    coordinatorTaskIndex: 0,
    viewSelectionMode: 'none',
    footerSelection: null,
    toolPermissionContext: tpc,
    agent: undefined,
    kairosEnabled: false,
    remoteSessionUrl: undefined,
    remoteConnectionStatus: 'disconnected',
    remoteBackgroundTaskCount: 0,
    replBridgeEnabled: false,
    replBridgeExplicit: false,
    replBridgeOutboundOnly: false,
    replBridgeConnected: false,
    replBridgeSessionActive: false,
    replBridgeReconnecting: false,
    replBridgeConnectUrl: undefined,
    replBridgeSessionUrl: undefined,
    replBridgeEnvironmentId: undefined,
    replBridgeSessionId: undefined,
    replBridgeError: undefined,
    replBridgeInitialName: undefined,
    showRemoteCallout: false,
    tasks: {},
    agentNameRegistry: new Map(),
    sessionHooks: new Map(),
    mcp: {
      clients: [],
      tools: [],
      commands: [],
      resources: {},
      pluginReconnectKey: 0,
    },
  } as unknown as AppState
}

// ---------------------------------------------------------------------------
// Tool permission context for server mode
// ---------------------------------------------------------------------------

function buildToolPermissionContext(
  permissionConfig?: PermissionConfig,
): ToolPermissionContext {
  const base = getEmptyToolPermissionContext()

  // In server mode, we don't have interactive permission dialogs.
  // The permission mode from session config maps to alwaysAllow/alwaysDeny rules.
  // The actual per-tool check is done by the canUseTool callback.
  if (permissionConfig) {
    const allowedTools = permissionConfig.allowedTools ?? []
    const deniedTools = permissionConfig.deniedTools ?? []

    if (allowedTools.length > 0) {
      const rules: Record<string, string[]> = { server: allowedTools }
      return {
        ...base,
        alwaysAllowRules: rules,
      }
    }
    if (deniedTools.length > 0) {
      const rules: Record<string, string[]> = { server: deniedTools }
      return {
        ...base,
        alwaysDenyRules: rules,
      }
    }
  }

  return base
}

// ---------------------------------------------------------------------------
// canUseTool — server mode permission callback
// ---------------------------------------------------------------------------

const TOOL_RESPONSE_TIMEOUT_MS = 30_000
const SESSION_CWD_MUTATION_TOOLS = new Set(['EnterWorktree', 'ExitWorktree'])

const READ_PATH_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS'])
const WRITE_PATH_TOOLS = new Set([
  'Write',
  'Edit',
  'FileEdit',
  'MultiEdit',
  'NotebookEdit',
])

async function checkServerFileBoundary(
  tool: Tool,
  input: Record<string, unknown>,
  context: SessionContext | undefined,
): Promise<{ applies: boolean; decision: PermissionDecision | null }> {
  if (!context?.config.workspaceRoot) {
    return { applies: false, decision: null }
  }

  const access = READ_PATH_TOOLS.has(tool.name)
    ? 'read'
    : WRITE_PATH_TOOLS.has(tool.name)
      ? 'write'
      : null
  if (!access) {
    return { applies: false, decision: null }
  }

  let path: string
  try {
    const candidate = tool.getPath?.(input as never)
    if (typeof candidate !== 'string' || !candidate) {
      return {
        applies: true,
        decision: {
          behavior: 'deny',
          message: `Tool "${tool.name}" did not provide a valid path for workspace validation`,
          decisionReason: {
            type: 'workingDir',
            reason: 'Missing tool path',
          },
        },
      }
    }
    path = candidate
  } catch {
    return {
      applies: true,
      decision: {
        behavior: 'deny',
        message: `Tool "${tool.name}" path validation failed`,
        decisionReason: {
          type: 'workingDir',
          reason: 'Tool path extraction failed',
        },
      },
    }
  }

  const boundary = await checkSessionWorkspacePath(path, access, {
    cwd: context.config.cwd,
    workspaceRoot: context.config.workspaceRoot,
    autoMemoryDir: context.config.autoMemoryDir,
    toolName: tool.name,
    userReadOnlyRoots: context.config.userReadOnlyRoots,
    sharedReadOnlyRoots: context.config.sharedReadOnlyRoots,
    skillReadOnlyRoots: context.skillReadOnlyRoots,
    serviceOnlyRoots: context.config.serviceOnlyRoots,
  })
  if (boundary.allowed === true) {
    return { applies: true, decision: null }
  }

  return {
    applies: true,
    decision: {
      behavior: 'deny',
      message: boundary.reason,
      decisionReason: {
        type: 'workingDir',
        reason: boundary.rootId
          ? `${boundary.reason} [root=${boundary.rootId}]`
          : boundary.reason,
      },
    },
  }
}

async function checkServerShellBoundary(
  tool: Tool,
  input: Record<string, unknown>,
  context: SessionContext | undefined,
): Promise<PermissionDecision | null> {
  if (
    !context?.config.workspaceRoot ||
    (tool.name !== 'Bash' && tool.name !== 'PowerShell')
  ) {
    return null
  }
  if (input.dangerouslyDisableSandbox === true) {
    return {
      behavior: 'deny',
      message: 'Sandbox overrides are not allowed in Network sessions',
      decisionReason: {
        type: 'workingDir',
        reason: 'Shell sandbox override requested',
      },
    }
  }
  if (typeof input.command !== 'string') {
    return {
      behavior: 'deny',
      message: 'Shell command is missing',
      decisionReason: {
        type: 'workingDir',
        reason: 'Missing shell command',
      },
    }
  }

  const boundary = await checkShellCommandWorkspace(
    input.command,
    tool.name === 'Bash' ? 'bash' : 'powershell',
    {
      cwd: context.config.cwd,
      workspaceRoot: context.config.workspaceRoot,
      autoMemoryDir: context.config.autoMemoryDir,
    },
  )
  if (boundary.allowed === true) {
    return null
  }
  return {
    behavior: 'deny',
    message: boundary.reason,
    decisionReason: {
      type: 'workingDir',
      reason: boundary.reason,
    },
  }
}

function createServerCanUseTool(
  permissionConfig?: PermissionConfig,
  context?: SessionContext,
): CanUseToolFn {
  return async (
    tool: Tool,
    input: any,
    _ctx: any,
    _msg: any,
    toolUseId: string,
    forceDecision?: PermissionDecision<any>,
  ): Promise<PermissionDecision<any>> => {
    if (forceDecision?.behavior === 'deny') {
      return forceDecision
    }

    if (SESSION_CWD_MUTATION_TOOLS.has(tool.name)) {
      return {
        behavior: 'deny',
        message: `Tool "${tool.name}" cannot change the working directory of a Network session`,
        decisionReason: {
          type: 'workingDir',
          reason: 'Network sessions are pinned to their user workspace',
        },
      }
    }

    const shellBoundaryDecision = await checkServerShellBoundary(
      tool,
      input,
      context,
    )
    if (shellBoundaryDecision) {
      return shellBoundaryDecision
    }

    const fileBoundary = await checkServerFileBoundary(
      tool,
      input,
      context,
    )
    if (fileBoundary.decision) {
      return fileBoundary.decision
    }

    if (
      forceDecision?.behavior === 'ask' &&
      forceDecision.decisionReason?.type === 'workingDir' &&
      !fileBoundary.applies
    ) {
      return {
        behavior: 'deny',
        message:
          forceDecision.message ||
          'Path is outside the current user workspace',
        decisionReason: forceDecision.decisionReason,
      }
    }

    const result = checkToolPermission(tool.name, permissionConfig ?? { mode: 'allow_all' })
    if (result.allowed === false) {
      return {
        behavior: 'deny',
        message: result.reason,
        decisionReason: {
          type: 'other',
          reason: 'Denied by server permission configuration',
        },
      }
    }

    // For tools that require user interaction (e.g. AskUserQuestion),
    // wait for the frontend to submit a response via POST tool-response.
    // The assistant SSE event with the tool_use block was already emitted,
    // so the frontend can render the interactive UI while we wait here.
    if (tool.requiresUserInteraction?.() && context) {
      const response = await waitForToolResponse(context, toolUseId)
      if (!response || !response.approved) {
        return {
          behavior: 'deny',
          message: 'User declined to answer questions',
          decisionReason: {
            type: 'other',
            reason: 'User declined the interactive tool request',
          },
        }
      }
      return {
        behavior: 'allow',
        updatedInput: { ...input, answers: response.answers ?? {}, annotations: response.annotations },
        decisionReason: {
          type: 'other',
          reason: 'User approved the interactive tool request',
        },
      }
    }

    return {
      behavior: 'allow',
      updatedInput:
        forceDecision?.behavior === 'ask'
          ? forceDecision.updatedInput ?? input
          : input,
      decisionReason: {
        type: 'other',
        reason: 'Allowed by server permission configuration',
      },
    }
  }
}

/**
 * Wait for a frontend tool-response submission, with a timeout.
 * Returns undefined if the wait times out.
 */
function waitForToolResponse(
  context: SessionContext,
  toolUseId: string,
): Promise<import('./SessionContext.js').ToolResponsePayload | undefined> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      context.pendingToolResponses.delete(toolUseId)
      resolve(undefined)
    }, TOOL_RESPONSE_TIMEOUT_MS)

    context.pendingToolResponses.set(toolUseId, {
      resolve: (payload) => {
        clearTimeout(timeout)
        context.pendingToolResponses.delete(toolUseId)
        resolve(payload)
      },
      timeout,
    })
  })
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

export function createQueryEngineForSession(
  context: SessionContext,
  options: {
    commands?: Command[]
    initialMessages?: any[]
    readFileCache?: FileStateCache
    mcpTools?: any[]
  } = {},
): QueryEngine {
  const { getAppState, setAppState } = createServerAppState(context.config.permissions)
  const canUseTool = createServerCanUseTool(context.config.permissions, context)
  const toolPermissionContext = getAppState().toolPermissionContext

  // Get the full tool set — this includes Read, Write, Edit, Bash, Glob, Grep, etc.
  // getTools filters based on toolPermissionContext and features.
  const builtInTools = getTools(toolPermissionContext)

  // Merge MCP tools if provided
  const mcpTools = options.mcpTools ?? []
  const tools = mcpTools.length > 0
    ? assembleToolPool(toolPermissionContext, mcpTools)
    : builtInTools
  const appendSystemPrompt = [
    CAREER_AGENT_LEARNING_SYSTEM_PROMPT,
    getProfileAgentSystemPrompt(),
    context.config.appendSystemPrompt,
  ].filter(Boolean).join('\n\n')

  const config: QueryEngineConfig = {
    cwd: context.config.cwd,
    tools,
    commands: options.commands ?? [],
    mcpClients: context.mcpClients ?? [],
    agents: [],
    canUseTool,
    requireCanUseTool: true,
    getAppState,
    setAppState,
    initialMessages: options.initialMessages ?? [],
    readFileCache: options.readFileCache ?? new Map() as FileStateCache,
    appendSystemPrompt,
    userSpecifiedModel: context.config.model,
    // TODO: read thinking config from SessionContext.config.thinkingMode once the
    // frontend setting is wired up (update-api-settings.dto.ts has the field stub).
    // When enabling thinking, also remove DISABLE_INTERLEAVED_THINKING from main.ts.
    // Options: { type: 'disabled' } | { type: 'adaptive' } | { type: 'enabled', budgetTokens: N }
    thinkingConfig: { type: 'disabled' },
    abortController: context.abortController,
  }

  return new QueryEngine(config)
}
