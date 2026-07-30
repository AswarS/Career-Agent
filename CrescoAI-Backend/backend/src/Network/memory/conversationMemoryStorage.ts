import { createHash } from 'node:crypto'
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { getSessionContext } from '../../server/SessionContext.js'
import { scanForSecrets } from '../../services/teamMemorySync/secretScanner.js'
import {
  getNetworkConversationMemoryDir,
  getNetworkConversationMemorySessionPath,
  getNetworkTranscriptPath,
} from '../utils/networkTranscriptStorage.js'
import type {
  ConversationMemoryFrontmatter,
  ConversationMemoryTurnState,
} from './conversationMemoryTypes.js'
import {
  isConversationMemorySessionDeleting,
  withConversationMemoryRootLock,
} from './conversationMemoryLock.js'
import { containsConversationMemoryPrivateIdentifier } from './conversationMemoryPublicPolicy.js'

export const CONVERSATION_MEMORY_SCHEMA_VERSION = 1
export const CONVERSATION_MEMORY_INDEX_START =
  '<!-- career-agent:conversation-memory:start -->'
export const CONVERSATION_MEMORY_INDEX_END =
  '<!-- career-agent:conversation-memory:end -->'

type ParsedSummary = {
  frontmatter: ConversationMemoryFrontmatter
  body: string
  topics: string[]
}

export function createConversationMemoryTemplate(
  conversationId: string,
): string {
  const transcriptFile = `${conversationId}.jsonl`
  return [
    '---',
    `schema_version: ${CONVERSATION_MEMORY_SCHEMA_VERSION}`,
    `conversation_id: ${conversationId}`,
    `transcript_file: ${transcriptFile}`,
    'last_processed_turn: bootstrap',
    `updated_at: ${new Date(0).toISOString()}`,
    'revision: 0',
    'topic_hooks:',
    '  - session-context',
    '---',
    `# ${transcriptFile}`,
    '',
    '## Session context',
    '',
    '- No durable session facts have been summarized yet.',
    '',
  ].join('\n')
}

export async function ensureConversationMemoryLayout(
  userId: string,
  conversationId: string,
  overrides: {
    rootDir?: string
    sessionSummaryPath?: string
    transcriptPath?: string
  } = {},
): Promise<{
  rootDir: string
  sessionSummaryPath: string
  transcriptPath: string
}> {
  const rootDir = resolve(
    overrides.rootDir ?? getNetworkConversationMemoryDir(userId),
  )
  const sessionSummaryPath = resolve(
    overrides.sessionSummaryPath ??
      getNetworkConversationMemorySessionPath(userId, conversationId),
  )
  const transcriptPath = resolve(
    overrides.transcriptPath ??
      getNetworkTranscriptPath(userId, conversationId),
  )
  await Promise.all(
    ['sessions', 'daily', 'state', '.index'].map((child) =>
      mkdir(join(rootDir, child), { recursive: true }),
    ),
  )

  try {
    await writeFile(
      sessionSummaryPath,
      createConversationMemoryTemplate(conversationId),
      { flag: 'wx' },
    )
  } catch (error) {
    if (!isErrorCode(error, 'EEXIST')) throw error
  }

  const statePath = getConversationMemoryStatePath(rootDir, conversationId)
  try {
    await writeFile(
      statePath,
      `${JSON.stringify(
        {
          schemaVersion: CONVERSATION_MEMORY_SCHEMA_VERSION,
          conversationId,
          committedTurnId: null,
          revision: 0,
          status: 'bootstrap',
        },
        null,
        2,
      )}\n`,
      { flag: 'wx' },
    )
  } catch (error) {
    if (!isErrorCode(error, 'EEXIST')) throw error
  }

  return { rootDir, sessionSummaryPath, transcriptPath }
}

export function parseConversationMemorySummary(content: string): ParsedSummary {
  const normalized = content.replaceAll('\r\n', '\n')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized)
  if (!match) {
    throw new Error('Conversation memory must start with YAML frontmatter')
  }

  const raw = parseYaml(match[1]) as Record<string, unknown>
  const topicHooks = Array.isArray(raw.topic_hooks)
    ? raw.topic_hooks.filter((item): item is string => typeof item === 'string')
    : []
  const frontmatter: ConversationMemoryFrontmatter = {
    schema_version: Number(raw.schema_version),
    conversation_id: String(raw.conversation_id ?? ''),
    transcript_file: String(raw.transcript_file ?? ''),
    last_processed_turn: String(raw.last_processed_turn ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    revision: Number(raw.revision),
    topic_hooks: topicHooks,
  }
  const topics = [...match[2].matchAll(/^##\s+(.+?)\s*$/gm)].map((item) =>
    item[1].trim(),
  )
  return { frontmatter, body: match[2].trimEnd(), topics }
}

export function validateConversationMemorySummary(
  content: string,
  expected: {
    conversationId: string
    requiredTurnId: string
  },
): ParsedSummary {
  const parsed = parseConversationMemorySummary(content)
  const { frontmatter } = parsed
  const transcriptFile = `${expected.conversationId}.jsonl`
  const errors: string[] = []

  if (frontmatter.schema_version !== CONVERSATION_MEMORY_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${CONVERSATION_MEMORY_SCHEMA_VERSION}`)
  }
  if (frontmatter.conversation_id !== expected.conversationId) {
    errors.push('conversation_id does not match the current session')
  }
  if (frontmatter.transcript_file !== transcriptFile) {
    errors.push(`transcript_file must be ${transcriptFile}`)
  }
  if (frontmatter.last_processed_turn !== expected.requiredTurnId) {
    errors.push(
      `last_processed_turn must be the current turn id ${expected.requiredTurnId}`,
    )
  }
  if (!Number.isInteger(frontmatter.revision) || frontmatter.revision < 1) {
    errors.push('revision must be a positive integer')
  }
  if (!Number.isFinite(Date.parse(frontmatter.updated_at))) {
    errors.push('updated_at must be an ISO-8601 timestamp')
  }
  if (frontmatter.topic_hooks.length === 0) {
    errors.push('topic_hooks must contain at least one retrieval hook')
  }
  if (!parsed.body.startsWith(`# ${transcriptFile}\n`)) {
    errors.push(`the first body heading must be "# ${transcriptFile}"`)
  }
  if (parsed.topics.length === 0) {
    errors.push('the summary must contain at least one level-two topic heading')
  }

  if (errors.length > 0) {
    throw new Error(`Invalid conversation memory summary: ${errors.join('; ')}`)
  }
  return parsed
}

export function getConversationMemoryToolPathError(
  filePath: string,
  content?: string,
): string | null {
  const turn = getSessionContext()?.conversationMemoryTurn
  if (!turn?.enabled || !isWithin(filePath, turn.rootDir)) return null
  if (isConversationMemorySessionDeleting(turn.rootDir, turn.conversationId)) {
    return 'Conversation memory for this deleted session is no longer writable'
  }
  if (resolve(filePath) !== resolve(turn.sessionSummaryPath)) {
    return (
      'Conversation memory is server-managed except for the current session ' +
      `summary: ${turn.sessionSummaryPath}`
    )
  }
  if (content !== undefined) {
    try {
      const parsed = validateConversationMemorySummary(content, {
        conversationId: turn.conversationId,
        requiredTurnId: turn.requiredTurnId,
      })
      if (
        containsConversationMemoryPrivateIdentifier(
          stripRequiredSummaryHeading(parsed.body),
          turn.privateConversationIds,
        )
      ) {
        throw new Error(
          'Conversation memory topic bodies must not contain conversation ids or transcript filenames',
        )
      }
      assertConversationMemoryContainsNoSecrets(content)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  return null
}

export function assertConversationMemoryContainsNoSecrets(
  content: string,
): void {
  const matches = scanForSecrets(content)
  if (matches.length > 0) {
    throw new Error(
      `Conversation memory contains potential secrets (${matches
        .map((match) => match.label)
        .join(', ')})`,
    )
  }
}

/**
 * Complete the server-owned half of a summary commit.  The file tool has
 * already written the canonical session Markdown before this function runs.
 */
export async function commitConversationMemorySessionUpdate(
  filePath: string,
  content: string,
): Promise<void> {
  const context = getSessionContext()
  const turn = context?.conversationMemoryTurn
  if (
    !turn?.enabled ||
    resolve(filePath) !== resolve(turn.sessionSummaryPath)
  ) {
    return
  }

  if (isConversationMemorySessionDeleting(turn.rootDir, turn.conversationId)) {
    await rm(filePath, { force: true }).catch(() => {})
    throw new Error('Conversation memory session is being deleted')
  }

  const parsed = validateConversationMemorySummary(content, {
    conversationId: turn.conversationId,
    requiredTurnId: turn.requiredTurnId,
  })
  if (
    containsConversationMemoryPrivateIdentifier(
      stripRequiredSummaryHeading(parsed.body),
      turn.privateConversationIds,
    )
  ) {
    throw new Error(
      'Conversation memory topic bodies must not contain conversation ids or transcript filenames',
    )
  }
  assertConversationMemoryContainsNoSecrets(content)

  await withConversationMemoryRootLock(turn.rootDir, async () => {
    if (
      isConversationMemorySessionDeleting(turn.rootDir, turn.conversationId)
    ) {
      await rm(filePath, { force: true }).catch(() => {})
      throw new Error('Conversation memory session is being deleted')
    }
    const priorState = await readConversationMemoryState(
      turn.rootDir,
      turn.conversationId,
    )
    const priorRevision = Number(priorState?.revision ?? 0)
    if (parsed.frontmatter.revision <= priorRevision) {
      throw new Error(
        `Conversation memory revision must be greater than ${priorRevision}`,
      )
    }

    await rebuildConversationMemoryAggregate(turn.rootDir)
    await appendConversationMemoryAudit(
      turn,
      parsed.frontmatter.revision,
      content,
    )
    await writeConversationMemoryState(turn, {
      committedTurnId: turn.requiredTurnId,
      revision: parsed.frontmatter.revision,
      status: 'committed',
      updatedAt: new Date().toISOString(),
      contentHash: sha256(content),
    })

    // SQLite is derived state.  A failed refresh must not invalidate the
    // Markdown commit; the next recall performs a full repair.
    try {
      const { syncConversationMemoryIndex } =
        await import('./conversationMemoryIndex.js')
      await syncConversationMemoryIndex(turn.rootDir)
    } catch (error) {
      console.warn('[ConversationMemory] index refresh deferred', {
        conversationId: turn.conversationId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  turn.committedTurnId = turn.requiredTurnId
  turn.status = 'committed'
}

export async function rebuildConversationMemoryAggregate(
  rootDir: string,
): Promise<string> {
  const sessionsDir = join(rootDir, 'sessions')
  const entries = await readdir(sessionsDir, { withFileTypes: true })
  const summaries: Array<{ name: string; body: string; updatedAt: string }> = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const path = join(sessionsDir, entry.name)
    try {
      const parsed = parseConversationMemorySummary(
        await readFile(path, 'utf8'),
      )
      summaries.push({
        name: entry.name,
        body: parsed.body,
        updatedAt: parsed.frontmatter.updated_at,
      })
    } catch (error) {
      console.warn('[ConversationMemory] skipped malformed session summary', {
        path,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  summaries.sort((left, right) => left.name.localeCompare(right.name))

  const managed = [
    CONVERSATION_MEMORY_INDEX_START,
    ...summaries.flatMap((summary) => [
      summary.body,
      '',
      `> Source: [sessions/${summary.name}](<sessions/${summary.name}>) · updated ${summary.updatedAt}`,
      '',
    ]),
    CONVERSATION_MEMORY_INDEX_END,
  ].join('\n')
  const aggregate = [
    '<!-- Conversation Memory: session filenames are the level-one headings. -->',
    '> Server-managed projection. Edit files under `sessions/` instead.',
    '',
    managed,
    '',
  ].join('\n')
  await writeFile(join(rootDir, 'MEMORY.md'), aggregate, 'utf8')
  return aggregate
}

export async function markConversationMemoryGateExhausted(
  turn: ConversationMemoryTurnState,
): Promise<void> {
  turn.status = 'gate_exhausted'
  await withConversationMemoryRootLock(turn.rootDir, () =>
    writeConversationMemoryState(turn, {
      committedTurnId: null,
      revision: null,
      status: 'gate_exhausted',
      requiredTurnId: turn.requiredTurnId,
      reminderCount: turn.reminderCount,
      updatedAt: new Date().toISOString(),
    }),
  )
}

async function appendConversationMemoryAudit(
  turn: ConversationMemoryTurnState,
  revision: number,
  content: string,
): Promise<void> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const [year, month] = date.split('-')
  const dir = join(turn.rootDir, 'daily', year, month)
  await mkdir(dir, { recursive: true })
  await appendFile(
    join(dir, `${date}.md`),
    [
      `- ${now.toISOString()} conversation=${turn.conversationId}`,
      `  turn=${turn.requiredTurnId} revision=${revision} sha256=${sha256(content)}`,
      `  source=${relative(turn.rootDir, turn.sessionSummaryPath).split(sep).join('/')}`,
      '',
    ].join('\n'),
    'utf8',
  )
}

async function readConversationMemoryState(
  rootDir: string,
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(
      await readFile(
        getConversationMemoryStatePath(rootDir, conversationId),
        'utf8',
      ),
    ) as Record<string, unknown>
  } catch (error) {
    if (isErrorCode(error, 'ENOENT') || error instanceof SyntaxError)
      return null
    throw error
  }
}

async function writeConversationMemoryState(
  turn: ConversationMemoryTurnState,
  state: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    getConversationMemoryStatePath(turn.rootDir, turn.conversationId),
    `${JSON.stringify(
      {
        schemaVersion: CONVERSATION_MEMORY_SCHEMA_VERSION,
        conversationId: turn.conversationId,
        ...state,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function getConversationMemoryStatePath(
  rootDir: string,
  conversationId: string,
): string {
  return join(rootDir, 'state', `${conversationId}.json`)
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function isWithin(path: string, root: string): boolean {
  const candidate = resolve(path)
  const boundary = resolve(root)
  return candidate === boundary || candidate.startsWith(`${boundary}${sep}`)
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

function stripRequiredSummaryHeading(body: string): string {
  return body.replace(/^#\s+[^\r\n]+\r?\n?/, '').trim()
}

export async function readCurrentConversationMemorySummary(
  sessionSummaryPath: string,
): Promise<string> {
  return readFile(sessionSummaryPath, 'utf8')
}

export async function getConversationMemorySummaryMtime(
  sessionSummaryPath: string,
): Promise<number> {
  return (await stat(sessionSummaryPath)).mtimeMs
}

export function isConversationMemorySessionFileName(path: string): boolean {
  return (
    /^[A-Za-z0-9_-]{8,128}\.md$/.test(basename(path)) &&
    basename(dirname(path)) === 'sessions'
  )
}
