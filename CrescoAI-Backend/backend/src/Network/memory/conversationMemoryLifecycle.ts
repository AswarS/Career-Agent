import { randomUUID } from 'node:crypto'
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isPathWithinRoot } from '../../server/workspaceSecurity.js'
import {
  assertSafeNetworkSessionId,
  getNetworkConversationMemoryDir,
} from '../utils/networkTranscriptStorage.js'
import { syncConversationMemoryIndex } from './conversationMemoryIndex.js'
import {
  markConversationMemorySessionDeleting,
  withConversationMemoryRootLock,
} from './conversationMemoryLock.js'
import { rebuildConversationMemoryAggregate } from './conversationMemoryStorage.js'

export type ConversationMemoryDeletionResult = {
  rootExisted: boolean
  sessionSummaryDeleted: boolean
  stateDeleted: boolean
  dailyEntriesDeleted: number
  aggregateRebuilt: boolean
  indexRebuilt: boolean
}

export async function deleteConversationMemorySession(
  userId: string | number,
  conversationId: string,
  options: { rootDir?: string } = {},
): Promise<ConversationMemoryDeletionResult> {
  assertSafeNetworkSessionId(conversationId)
  const rootDir = resolve(
    options.rootDir ?? getNetworkConversationMemoryDir(userId),
  )
  const sessionSummaryPath = resolve(
    rootDir,
    'sessions',
    `${conversationId}.md`,
  )
  const statePath = resolve(rootDir, 'state', `${conversationId}.json`)
  assertLifecyclePath(rootDir, sessionSummaryPath)
  assertLifecyclePath(rootDir, statePath)
  markConversationMemorySessionDeleting(rootDir, conversationId)

  if (!(await pathExists(rootDir))) {
    return emptyDeletionResult(false)
  }

  return withConversationMemoryRootLock(rootDir, async () => {
    const sessionSummaryDeleted = await removeFileIfPresent(sessionSummaryPath)
    const stateDeleted = await removeFileIfPresent(statePath)
    const dailyEntriesDeleted = await removeConversationMemoryAuditEntries(
      join(rootDir, 'daily'),
      conversationId,
    )
    const sessionsDir = join(rootDir, 'sessions')
    if (!(await pathExists(sessionsDir))) {
      await removeFileIfPresent(
        join(rootDir, '.index', 'conversation-memory.sqlite'),
      )
      return {
        rootExisted: true,
        sessionSummaryDeleted,
        stateDeleted,
        dailyEntriesDeleted,
        aggregateRebuilt: false,
        indexRebuilt: false,
      }
    }

    await rebuildConversationMemoryAggregate(rootDir)
    await syncConversationMemoryIndex(rootDir)
    return {
      rootExisted: true,
      sessionSummaryDeleted,
      stateDeleted,
      dailyEntriesDeleted,
      aggregateRebuilt: true,
      indexRebuilt: true,
    }
  })
}

export function removeConversationAuditEntriesFromContent(
  content: string,
  conversationId: string,
): { content: string; removed: number } {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const kept: string[] = []
  let removed = 0
  let index = 0
  while (index < lines.length) {
    const match = /^-\s+\S+\s+conversation=(\S+)\s*$/.exec(lines[index])
    if (match?.[1] !== conversationId) {
      kept.push(lines[index])
      index += 1
      continue
    }

    removed += 1
    index += 1
    while (
      index < lines.length &&
      (lines[index].startsWith('  ') || lines[index].trim() === '')
    ) {
      index += 1
    }
  }

  const nextContent = kept.join('\n').replace(/^\n+|\n+$/g, '')
  return {
    content: nextContent ? `${nextContent}\n` : '',
    removed,
  }
}

async function removeConversationMemoryAuditEntries(
  dailyDir: string,
  conversationId: string,
): Promise<number> {
  const files = await listMarkdownFiles(dailyDir)
  let removed = 0
  for (const filePath of files) {
    const original = await readFile(filePath, 'utf8')
    const filtered = removeConversationAuditEntriesFromContent(
      original,
      conversationId,
    )
    if (filtered.removed === 0) continue
    removed += filtered.removed
    if (!filtered.content) {
      await rm(filePath, { force: true })
      continue
    }
    await writeFileAtomically(filePath, filtered.content)
  }
  return removed
}

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(rootDir, { withFileTypes: true })
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return []
    throw error
  }

  const files: string[] = []
  for (const entry of entries) {
    const path = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path)
    }
  }
  return files
}

async function writeFileAtomically(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {})
  }
}

async function removeFileIfPresent(path: string): Promise<boolean> {
  if (!(await pathExists(path))) return false
  await rm(path, { force: true })
  return true
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return false
    throw error
  }
}

function assertLifecyclePath(rootDir: string, path: string): void {
  if (!isPathWithinRoot(path, rootDir) || path === rootDir) {
    throw new Error(`Refusing Conversation Memory cleanup outside ${rootDir}`)
  }
}

function emptyDeletionResult(
  rootExisted: boolean,
): ConversationMemoryDeletionResult {
  return {
    rootExisted,
    sessionSummaryDeleted: false,
    stateDeleted: false,
    dailyEntriesDeleted: 0,
    aggregateRebuilt: false,
    indexRebuilt: false,
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}
