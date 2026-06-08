/**
 * permissions.ts — Server-mode permission model
 *
 * CLI mode uses interactive dialogs for tool approval. Server mode needs a
 * non-interactive alternative. This module provides three security levels
 * plus an explicit mode (WS real-time approval, V2).
 *
 * V1 default: allow_all — trust all tool calls.
 */

export type ServerPermissionMode = 'allow_all' | 'deny_dangerous' | 'allow_read_only' | 'explicit'

export type PermissionConfig = {
  mode: ServerPermissionMode
  /** Tools always denied, regardless of mode */
  deniedTools?: string[]
  /** Tools always allowed, regardless of mode */
  allowedTools?: string[]
}

/** Tools classified as "dangerous" — filesystem writes, exec, network */
const DANGEROUS_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'MultiEdit',
  'FileEdit',
  'NotebookEdit',
  'SSH',
])

/** Tools classified as "read-only" — safe in any context */
const READ_ONLY_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'WebSearch',
  'WebFetch',
  'LSP',
  'TodoRead',
])

/**
 * Check if a tool call is permitted under the given permission config.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkToolPermission(
  toolName: string,
  config: PermissionConfig,
): { allowed: true } | { allowed: false; reason: string } {
  // Explicit deny list always wins
  if (config.deniedTools?.includes(toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" is in the denied list` }
  }

  // Explicit allow list always wins
  if (config.allowedTools?.includes(toolName)) {
    return { allowed: true }
  }

  switch (config.mode) {
    case 'allow_all':
      return { allowed: true }

    case 'deny_dangerous':
      if (DANGEROUS_TOOLS.has(toolName)) {
        return { allowed: false, reason: `Tool "${toolName}" is classified as dangerous and mode is deny_dangerous` }
      }
      return { allowed: true }

    case 'allow_read_only':
      if (!READ_ONLY_TOOLS.has(toolName)) {
        return { allowed: false, reason: `Tool "${toolName}" is not read-only and mode is allow_read_only` }
      }
      return { allowed: true }

    case 'explicit':
      // V2: will delegate to WS real-time confirmation
      return { allowed: false, reason: 'Explicit permission mode requires real-time confirmation (not yet implemented)' }

    default:
      return { allowed: false, reason: `Unknown permission mode: ${config.mode}` }
  }
}
