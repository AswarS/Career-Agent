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
import type { PermissionDecision } from '../utils/permissions/permissions.js'
import type { ToolType } from '../Tool.js'
import type { FileStateCache } from '../utils/fileStateCache.js'

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

function createServerCanUseTool(permissionConfig?: PermissionConfig): CanUseToolFn {
  return async (tool: ToolType, input: any, _ctx: any, _msg: any, _id: string): Promise<PermissionDecision<any>> => {
    const result = checkToolPermission(tool.name, permissionConfig ?? { mode: 'allow_all' })
    if (result.allowed) {
      return {
        behavior: 'allow',
        updatedInput: input,
        decisionReason: { type: 'config' },
      }
    }
    return {
      behavior: 'deny',
      message: result.reason,
      decisionReason: { type: 'config' },
    }
  }
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
  const canUseTool = createServerCanUseTool(context.config.permissions)
  const toolPermissionContext = getAppState().toolPermissionContext

  // Get the full tool set — this includes Read, Write, Edit, Bash, Glob, Grep, etc.
  // getTools filters based on toolPermissionContext and features.
  const builtInTools = getTools(toolPermissionContext)

  // Merge MCP tools if provided
  const mcpTools = options.mcpTools ?? []
  const tools = mcpTools.length > 0
    ? assembleToolPool(toolPermissionContext, mcpTools)
    : builtInTools

  const config: QueryEngineConfig = {
    cwd: context.config.cwd,
    tools,
    commands: options.commands ?? [],
    mcpClients: context.mcpClients ?? [],
    agents: [],
    canUseTool,
    getAppState,
    setAppState,
    initialMessages: options.initialMessages ?? [],
    readFileCache: options.readFileCache ?? new Map() as FileStateCache,
    userSpecifiedModel: context.config.model,
    abortController: context.abortController,
  }

  return new QueryEngine(config)
}
