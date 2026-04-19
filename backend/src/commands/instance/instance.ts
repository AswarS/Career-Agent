/**
 * /instance command implementation
 *
 * Dispatches subcommands to InstanceCommandManager.
 * Usage: /instance new|list|switch|close|send|logs|status|resume|info [args]
 */
import type { LocalCommandCall } from '../../types/command.js'
import {
  getInstanceManager,
  parseInstanceCommand,
  formatInstanceList,
  type CreateInstanceOptions,
  type BackgroundInstanceTask,
} from '../../server/instanceCommands.js'

export const call: LocalCommandCall = async (args, _context) => {
  const manager = getInstanceManager()
  const { subcommand, args: subArgs } = parseInstanceCommand(args)

  switch (subcommand) {
    case 'new':
      return await handleNew(manager, subArgs)
    case 'list':
    case 'ls':
      return handleList(manager)
    case 'switch':
    case 'use':
      return handleSwitch(manager, subArgs)
    case 'close':
    case 'rm':
    case 'destroy':
      return await handleClose(manager, subArgs)
    case 'send':
    case 'message':
    case 'msg':
      return handleSend(manager, subArgs)
    case 'logs':
    case 'log':
    case 'output':
      return handleLogs(manager, subArgs)
    case 'status':
    case 'bg':
    case 'tasks':
      return handleBgStatus(manager)
    case 'info':
    case 'current':
      return handleInfo(manager)
    case 'resume':
      return await handleResume(manager, subArgs)
    case '':
    case 'help':
      return handleHelp()
    default:
      return { type: 'text', value: `Unknown subcommand: "${subcommand}". Use /instance help for usage.` }
  }
}

async function handleNew(manager: ReturnType<typeof getInstanceManager>, args: string) {
  // Parse key=value pairs from args, or use defaults
  const opts = parseNewArgs(args)
  const result = await manager.createInstance(opts)
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  return { type: 'text', value: result.message }
}

function handleList(manager: ReturnType<typeof getInstanceManager>) {
  const instances = manager.listInstances()
  const currentId = manager.getCurrentInstanceId()
  const output = formatInstanceList(instances, currentId)
  return { type: 'text', value: output }
}

function handleSwitch(manager: ReturnType<typeof getInstanceManager>, args: string) {
  const sessionId = args.trim()
  if (!sessionId) {
    return { type: 'text', value: 'Usage: /instance switch <session-id>' }
  }
  // Support short IDs (first 8 chars)
  const fullId = resolveInstanceId(manager, sessionId)
  if (!fullId) {
    return { type: 'text', value: `Instance not found: ${sessionId}` }
  }
  const result = manager.switchInstance(fullId)
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  return { type: 'text', value: result.message }
}

async function handleClose(manager: ReturnType<typeof getInstanceManager>, args: string) {
  const sessionId = args.trim()
  if (!sessionId) {
    return { type: 'text', value: 'Usage: /instance close <session-id>' }
  }
  const fullId = resolveInstanceId(manager, sessionId)
  if (!fullId) {
    return { type: 'text', value: `Instance not found: ${sessionId}` }
  }
  const result = await manager.closeInstance(fullId)
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  return { type: 'text', value: result.message }
}

function handleInfo(manager: ReturnType<typeof getInstanceManager>) {
  const result = manager.getCurrentInfo()
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  const lines = [result.message]
  if ('info' in result && result.info) {
    const info = result.info
    lines.push(`  Base URL: ${info.hasQueryEngine ? 'active' : 'no QueryEngine'}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

function handleSend(manager: ReturnType<typeof getInstanceManager>, args: string) {
  const trimmed = args.trim()
  if (!trimmed) {
    return { type: 'text', value: 'Usage: /instance send <id|userId> <message>' }
  }
  // First token is target, rest is message
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) {
    return { type: 'text', value: 'Usage: /instance send <id|userId> <message>' }
  }
  const target = trimmed.slice(0, spaceIndex)
  const message = trimmed.slice(spaceIndex + 1)
  const result = manager.sendToInstance(target, message)
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  return { type: 'text', value: result.message }
}

function handleLogs(manager: ReturnType<typeof getInstanceManager>, args: string) {
  const target = args.trim() || undefined
  const result = manager.getInstanceLogs(target)
  if (!result.ok) {
    return { type: 'text', value: `Error: ${result.error}` }
  }
  const lines: string[] = []
  for (const task of result.logs) {
    const shortId = task.instanceId.slice(0, 8)
    const elapsed = task.endTime ? `${((task.endTime - task.startTime) / 1000).toFixed(1)}s` : '...'
    lines.push(`--- ${task.userId} (${shortId}) ---`)
    lines.push(`  Status: ${task.status} | Time: ${elapsed}`)
    if (task.status === 'done' && task.response) {
      // Truncate long responses for inline display
      const display = task.response.length > 500
        ? task.response.slice(0, 500) + `... (${task.response.length} chars total)`
        : task.response
      lines.push(`  Response: ${display}`)
    }
    if (task.status === 'error' && task.error) {
      lines.push(`  Error: ${task.error}`)
    }
    lines.push('')
  }
  return { type: 'text', value: lines.join('\n') || 'No background tasks yet.' }
}

function handleBgStatus(manager: ReturnType<typeof getInstanceManager>) {
  const bgStatus = manager.getBackgroundStatus()
  const instances = manager.listInstances()

  if (instances.length === 0) {
    return { type: 'text', value: 'No active instances.' }
  }

  const lines: string[] = ['Instance status:', '']
  for (const inst of instances) {
    const shortId = inst.sessionId.slice(0, 8)
    const task = bgStatus.get(inst.sessionId)
    let statusStr: string
    if (!task) {
      statusStr = 'idle'
    } else if (task.status === 'running') {
      const elapsed = ((Date.now() - task.startTime) / 1000).toFixed(0)
      statusStr = `running (${elapsed}s)`
    } else if (task.status === 'done') {
      const elapsed = ((task.endTime! - task.startTime) / 1000).toFixed(1)
      statusStr = `done (${elapsed}s)`
    } else {
      statusStr = `error: ${task.error?.slice(0, 60)}`
    }
    const marker = inst.sessionId === manager.getCurrentInstanceId() ? '*' : ' '
    lines.push(` ${marker} ${shortId}  ${inst.userId.padEnd(12)}  ${statusStr}`)
  }
  lines.push('')
  lines.push('  * = current instance')
  return { type: 'text', value: lines.join('\n') }
}

async function handleResume(manager: ReturnType<typeof getInstanceManager>, args: string) {
  // Resume is a create with resumeFrom — for now just redirect to new
  // Full resume support requires session transcript lookup (batch 6 feature)
  return { type: 'text', value: 'Resume: use /instance new with the same userId to continue. Full transcript resume is available via the REST API.' }
}

function handleHelp() {
  const help = [
    '/instance — Manage multi-user instances',
    '',
    '  /instance new [userId=<id>] [apiKey=<key>] [baseUrl=<url>] [cwd=<dir>]',
    '    Create a new isolated instance',
    '',
    '  /instance list',
    '    List all active instances',
    '',
    '  /instance switch <session-id>',
    '    Switch to an instance (8-char ID or userId)',
    '',
    '  /instance send <id|userId> <message>',
    '    Send message to an instance in background (non-blocking)',
    '',
    '  /instance logs [id|userId]',
    '    View background task response (omit for all)',
    '',
    '  /instance status',
    '    Show all instances with running/idle/done status',
    '',
    '  /instance close <session-id>',
    '    Close and destroy an instance',
    '',
    '  /instance info',
    '    Show current instance details',
    '',
    '  /instance resume <session-id>',
    '    Resume from history (via REST API)',
  ]
  return { type: 'text', value: help.join('\n') }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNewArgs(args: string): CreateInstanceOptions {
  const opts: CreateInstanceOptions = { userId: 'default' }
  if (!args) return opts

  for (const part of args.split(/\s+/)) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) {
      // Positional arg = userId
      opts.userId = part
      continue
    }
    const key = part.slice(0, eqIndex)
    const value = part.slice(eqIndex + 1)
    switch (key) {
      case 'userId':
      case 'user':
        opts.userId = value
        break
      case 'apiKey':
      case 'key':
        opts.apiKey = value
        break
      case 'baseUrl':
      case 'url':
        opts.baseUrl = value
        break
      case 'cwd':
      case 'dir':
        opts.cwd = value
        break
    }
  }
  return opts
}

function resolveInstanceId(
  manager: ReturnType<typeof getInstanceManager>,
  partialId: string,
): string | null {
  const instances = manager.listInstances()
  // Exact match first
  if (instances.some(i => i.sessionId === partialId)) {
    return partialId
  }
  // Prefix match (8-char short ID)
  const matches = instances.filter(i => i.sessionId.startsWith(partialId))
  if (matches.length === 1) return matches[0].sessionId
  if (matches.length > 1) return null // ambiguous
  return null
}
