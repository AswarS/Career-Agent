import { isAbsolute } from 'node:path'
import {
  checkSessionWorkspacePath,
  type WorkspacePathDecision,
} from './workspaceSecurity.js'

export type ServerShellKind = 'bash' | 'powershell'

export type ShellWorkspaceDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

const CWD_COMMANDS = new Set([
  'cd',
  'chdir',
  'pushd',
  'set-location',
  'sl',
])

const PATH_VALUE_FLAGS = new Set([
  '-c',
  '-C',
  '--cwd',
  '--directory',
  '--git-dir',
  '--prefix',
  '--project',
  '--work-tree',
  '-LiteralPath',
  '-Path',
])

function splitCommandSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote: 'single' | 'double' | null = null
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== 'single') {
      current += char
      escaped = true
      continue
    }
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      current += char
      continue
    }
    if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      current += char
      continue
    }
    if (!quote && (char === ';' || char === '|' || char === '\n' || char === '\r')) {
      if (current.trim()) segments.push(current.trim())
      current = ''
      if (command[index + 1] === char) index += 1
      continue
    }
    if (!quote && char === '&') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      if (command[index + 1] === '&') index += 1
      continue
    }
    current += char
  }

  if (current.trim()) segments.push(current.trim())
  return segments
}

function tokenizeSegment(segment: string): string[] {
  const tokens: string[] = []
  const matcher = /"((?:\\.|[^"])*)"|'([^']*)'|([^\s]+)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(segment)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return tokens.filter(Boolean)
}

function cleanPathToken(token: string): string {
  return token
    .replace(/^[<>(){},]+/, '')
    .replace(/[<>(){},]+$/, '')
    .replace(/^['"]+|['"]+$/g, '')
}

function looksLikePath(token: string): boolean {
  if (!token || token.startsWith('-') || /^[a-z][a-z\d+.-]*:\/\//i.test(token)) {
    return false
  }
  return (
    token === '.' ||
    token === '..' ||
    token.startsWith('./') ||
    token.startsWith('.\\') ||
    token.startsWith('../') ||
    token.startsWith('..\\') ||
    token.startsWith('/') ||
    token.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(token) ||
    token.includes('/') ||
    token.includes('\\')
  )
}

function extractPathCandidates(tokens: string[]): string[] {
  const candidates = new Set<string>()
  for (let index = 0; index < tokens.length; index += 1) {
    const rawToken = tokens[index]!
    const equalsIndex = rawToken.indexOf('=')
    if (equalsIndex > 0) {
      const flag = rawToken.slice(0, equalsIndex)
      const value = cleanPathToken(rawToken.slice(equalsIndex + 1))
      if (PATH_VALUE_FLAGS.has(flag) || looksLikePath(value)) {
        candidates.add(value)
      }
      continue
    }

    if (PATH_VALUE_FLAGS.has(rawToken) && tokens[index + 1]) {
      candidates.add(cleanPathToken(tokens[index + 1]!))
      index += 1
      continue
    }

    const token = cleanPathToken(rawToken)
    const embeddedWindowsPath = token.match(/[A-Za-z]:[\\/].*$/)?.[0]
    if (embeddedWindowsPath) {
      candidates.add(cleanPathToken(embeddedWindowsPath))
    } else if (looksLikePath(token)) {
      candidates.add(token)
    }
  }
  return [...candidates].filter(Boolean)
}

function findCommandIndex(tokens: string[]): number {
  return tokens.findIndex(token => !/^[A-Za-z_][A-Za-z\d_]*=.*/.test(token))
}

function getStaticSyntaxViolation(command: string): string | null {
  if (!command.trim()) return 'Shell command is empty'
  if (command.includes('\0')) return 'Shell command contains a null byte'
  if (/\$\(|\$\{|`|<\(|>\(/.test(command)) {
    return 'Dynamic shell expansion is not allowed in Network sessions'
  }
  if (/\$[A-Za-z_]|%[A-Za-z_][A-Za-z\d_]*%|\$env:/i.test(command)) {
    return 'Environment-variable path expansion is not allowed in Network sessions'
  }
  if (/(^|[;&|]\s*|\s)(bash|sh|zsh|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|wsl|python\d*|node|bun|deno|ruby|perl|php)(?=\s|$)/i.test(command)) {
    return 'Nested command interpreters are not allowed in Network sessions'
  }
  if (/(^|[;&|]\s*|\s)(eval|invoke-expression|iex)\b/i.test(command)) {
    return 'Dynamic command evaluation is not allowed in Network sessions'
  }
  if (/(^|[\s'"(])[A-Za-z]:(?![\\/])/i.test(command)) {
    return 'Drive-relative paths are not allowed in Network sessions'
  }
  if (/\b(?:env|registry|hklm|hkcu|cert|variable|function|alias):\\|\b[A-Za-z][\w.-]*::/i.test(command)) {
    return 'PowerShell provider paths are not allowed in Network sessions'
  }
  if (/\b(join-path|resolve-path)\b|\[[Cc]har\]|['"]\s*\+\s*['"]/.test(command)) {
    return 'Dynamic path construction is not allowed in Network sessions'
  }
  return null
}

async function checkShellPath(
  path: string,
  cwd: string,
  options: {
    workspaceRoot: string
    autoMemoryDir?: string
  },
): Promise<WorkspacePathDecision> {
  const decision = await checkSessionWorkspacePath(path, 'write', {
    cwd,
    workspaceRoot: options.workspaceRoot,
    autoMemoryDir: options.autoMemoryDir,
  })
  if (decision.allowed && decision.rootType === 'memory') {
    return {
      allowed: false,
      reason:
        'Auto-memory is not accessible through shell tools; use Read, Grep, Edit, or Write so memory policy and index updates are enforced',
    }
  }
  return decision
}

/**
 * Temporary defense for Network shell tools. This is intentionally
 * conservative: syntax whose effective path cannot be established from the
 * command string is denied until an OS sandbox replaces this guard.
 */
export async function checkShellCommandWorkspace(
  command: string,
  _kind: ServerShellKind,
  options: {
    cwd: string
    workspaceRoot: string
    autoMemoryDir?: string
  },
): Promise<ShellWorkspaceDecision> {
  const syntaxViolation = getStaticSyntaxViolation(command)
  if (syntaxViolation) {
    return { allowed: false, reason: syntaxViolation }
  }

  let effectiveCwd = options.cwd
  for (const segment of splitCommandSegments(command)) {
    const tokens = tokenizeSegment(segment)
    const commandIndex = findCommandIndex(tokens)
    if (commandIndex < 0) continue

    const commandName = tokens[commandIndex]!.replace(/\.exe$/i, '').toLowerCase()
    const cwdTarget = CWD_COMMANDS.has(commandName)
      ? cleanPathToken(tokens[commandIndex + 1] ?? '')
      : null

    if (CWD_COMMANDS.has(commandName) && !cwdTarget) {
      return {
        allowed: false,
        reason: 'Changing to an implicit home directory is not allowed',
      }
    }

    const candidates = extractPathCandidates(tokens)
    if (cwdTarget && !candidates.includes(cwdTarget)) {
      candidates.push(cwdTarget)
    }

    for (const candidate of candidates) {
      if (candidate.startsWith('~')) {
        return {
          allowed: false,
          reason: 'Home-directory expansion is not allowed in Network sessions',
        }
      }
      const pathDecision = await checkShellPath(candidate, effectiveCwd, options)
      if (pathDecision.allowed === false) {
        return {
          allowed: false,
          reason: `Shell path "${candidate}" is not allowed: ${pathDecision.reason}`,
        }
      }
      if (cwdTarget === candidate) {
        effectiveCwd = pathDecision.canonicalPath
      }
    }

    // A bare absolute path can only be missed if it was embedded in unusual
    // punctuation. Reject obvious absolute syntax that yielded no candidate.
    if (
      candidates.length === 0 &&
      (isAbsolute(segment.trim()) || /[A-Za-z]:[\\/]/.test(segment))
    ) {
      return {
        allowed: false,
        reason: 'Shell command contains an unrecognized absolute path',
      }
    }
  }

  return { allowed: true }
}
