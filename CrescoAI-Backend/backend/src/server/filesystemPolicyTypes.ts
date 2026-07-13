/**
 * Filesystem capability types shared by Network session construction and the
 * final server-side tool boundary. Paths are application supplied; agents and
 * skill prompt text must never be able to create these grants directly.
 */

export const NETWORK_READ_ONLY_FILE_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'LS',
] as const

export type NetworkReadOnlyFileTool =
  (typeof NETWORK_READ_ONLY_FILE_TOOLS)[number]

export type SessionFilesystemRoot = {
  /** Stable identifier used in permission decisions and audit logs. */
  id: string
  /** Absolute root path. It is canonicalized again before every decision. */
  root: string
}

export type SessionReadOnlyRoot = SessionFilesystemRoot & {
  /** File tools that may read this root. Shell access is intentionally absent. */
  allowedTools: readonly NetworkReadOnlyFileTool[]
}

