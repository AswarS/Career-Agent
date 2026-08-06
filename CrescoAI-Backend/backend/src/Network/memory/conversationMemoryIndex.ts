import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import sqlite3 from 'sqlite3'
import { parse as parseYaml } from 'yaml'
import type {
  ConversationMemoryEvidenceUnit,
  ConversationMemorySearchResult,
  ProfileEvidenceSearchOptions,
} from './conversationMemoryTypes.js'

const INDEX_SCHEMA_VERSION = '2'
const MAX_RECALL_TERMS = 48
const CJK_RECALL_STOP_TERMS = new Set([
  '一下',
  '之前',
  '什么',
  '你们',
  '到哪',
  '可以',
  '咱们',
  '哪了',
  '如何',
  '帮我',
  '我们',
  '我想',
  '是否',
  '聊聊',
  '请问',
  '这个',
  '那个',
])

type Chunk = {
  id: string
  path: string
  heading: string
  startLine: number
  endLine: number
  content: string
  hash: string
}

type EvidenceUnit = Omit<ConversationMemoryEvidenceUnit, 'score'>

type ConversationMemorySearchOptions = {
  excludePaths?: Iterable<string>
}

export async function syncConversationMemoryIndex(
  rootDir: string,
): Promise<void> {
  const canonicalRoot = resolve(rootDir)
  const indexDir = join(canonicalRoot, '.index')
  await mkdir(indexDir, { recursive: true })
  const db = await openDatabase(join(indexDir, 'conversation-memory.sqlite'))
  try {
    await initializeSchema(db)
    const documents = await collectDocuments(canonicalRoot)
    const chunks = documents.flatMap((document) =>
      chunkMarkdown(canonicalRoot, document.path, document.content),
    )
    const evidenceUnits = documents.flatMap((document) =>
      extractEvidenceUnits(canonicalRoot, document.path, document.content),
    )
    const previousEvidenceRows = await all(
      db,
      'SELECT unit_id, source_turn_id, source_precision FROM evidence_units',
    )
    const previousEvidence = new Map(previousEvidenceRows.map((row) => [String(row.unit_id), row]))
    const isFirstEvidenceBuild = previousEvidenceRows.length === 0
    for (const unit of evidenceUnits) {
      const previous = previousEvidence.get(unit.unitId)
      if (previous) {
        unit.sourceTurnId = previous.source_turn_id ? String(previous.source_turn_id) : null
        unit.sourcePrecision = previous.source_precision === 'turn' ? 'turn' : 'summary'
      } else if (isFirstEvidenceBuild) {
        unit.sourceTurnId = null
        unit.sourcePrecision = 'summary'
      }
    }
    await run(db, 'BEGIN IMMEDIATE')
    try {
      await run(db, 'DELETE FROM chunks')
      await run(db, 'DELETE FROM chunks_fts')
      await run(db, 'DELETE FROM evidence_units')
      await run(db, 'DELETE FROM evidence_units_fts')
      for (const chunk of chunks) {
        await run(
          db,
          `INSERT INTO chunks
            (id, path, heading, start_line, end_line, content, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            chunk.id,
            chunk.path,
            chunk.heading,
            chunk.startLine,
            chunk.endLine,
            chunk.content,
            chunk.hash,
          ],
        )
        await run(
          db,
          `INSERT INTO chunks_fts (content, heading, path, chunk_id)
           VALUES (?, ?, ?, ?)`,
          [chunk.content, chunk.heading, chunk.path, chunk.id],
        )
      }
      for (const unit of evidenceUnits) {
        await run(
          db,
          `INSERT INTO evidence_units
            (unit_id, path, conversation_id, heading, content, content_hash,
             summary_revision, summary_updated_at, source_turn_id, source_precision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [unit.unitId, unit.path, unit.conversationId, unit.heading, unit.content,
            unit.contentHash, unit.summaryRevision, unit.summaryUpdatedAt,
            unit.sourceTurnId, unit.sourcePrecision],
        )
        await run(
          db,
          `INSERT INTO evidence_units_fts
            (content, heading, conversation_id, unit_id)
           VALUES (?, ?, ?, ?)`,
          [unit.content, unit.heading, unit.conversationId, unit.unitId],
        )
      }
      await run(
        db,
        `INSERT OR REPLACE INTO metadata (key, value) VALUES
          ('schema_version', ?), ('root_identity', ?), ('updated_at', ?)`,
        [INDEX_SCHEMA_VERSION, sha256(canonicalRoot), new Date().toISOString()],
      )
      await run(db, 'COMMIT')
    } catch (error) {
      await run(db, 'ROLLBACK').catch(() => {})
      throw error
    }
  } finally {
    await closeDatabase(db)
  }
}

/**
 * Internal bounded candidate search for Profile refresh. It intentionally
 * returns service-only metadata; callers must replace it with job-local refs
 * before placing candidates in model context.
 */
export async function searchProfileEvidenceCandidates(
  rootDir: string,
  queries: string[],
  options: ProfileEvidenceSearchOptions = {},
): Promise<ConversationMemoryEvidenceUnit[]> {
  await syncConversationMemoryIndex(rootDir)
  const db = await openDatabase(
    join(resolve(rootDir), '.index', 'conversation-memory.sqlite'),
  )
  try {
    const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 60), 100))
    const maxChars = Math.max(2_000, Math.min(options.maxChars ?? 28_000, 50_000))
    const excluded = new Set(options.excludeConversationIds ?? [])
    const terms = extractConversationMemoryRecallTerms(queries.join(' '))
    let rows: Array<Record<string, unknown>>
    if (terms.length) {
      const ranks: string[] = []
      const params: unknown[] = []
      for (const term of terms.slice(0, 32)) {
        const weight = recallTermWeight(term)
        ranks.push(`(CASE WHEN content LIKE ? ESCAPE '\\' THEN ${weight} ELSE 0 END + CASE WHEN heading LIKE ? ESCAPE '\\' THEN ${weight * 2} ELSE 0 END)`)
        const pattern = `%${escapeLikeTerm(term)}%`
        params.push(pattern, pattern)
      }
      rows = await all(
        db,
        `SELECT *, ${ranks.join(' + ')} AS relevance
           FROM evidence_units
          WHERE (${ranks.join(' + ')}) > 0
          ORDER BY relevance DESC, summary_updated_at DESC
          LIMIT ?`,
        [...params, ...params, limit * 3],
      )
    } else {
      rows = await all(
        db,
        `SELECT *, 0 AS relevance FROM evidence_units
          ORDER BY summary_updated_at DESC LIMIT ?`,
        [limit * 3],
      )
    }
    const results: ConversationMemoryEvidenceUnit[] = []
    let usedChars = 0
    for (const row of rows) {
      if (excluded.has(String(row.conversation_id))) continue
      const content = String(row.content)
      if (usedChars + content.length > maxChars && results.length) break
      results.push(mapEvidenceRow(row))
      usedChars += content.length
      if (results.length >= limit) break
    }
    return results
  } finally {
    await closeDatabase(db)
  }
}

export async function listProfileEvidenceCandidates(
  rootDir: string,
  options: ProfileEvidenceSearchOptions = {},
): Promise<ConversationMemoryEvidenceUnit[]> {
  return searchProfileEvidenceCandidates(rootDir, [], options)
}

export async function resolveConversationEvidenceUnit(
  rootDir: string,
  unitId: string,
): Promise<ConversationMemoryEvidenceUnit | null> {
  const units = await resolveConversationEvidenceUnits(rootDir, [unitId])
  return units.get(unitId) ?? null
}

export async function resolveConversationEvidenceUnits(
  rootDir: string,
  unitIds: Iterable<string>,
): Promise<Map<string, ConversationMemoryEvidenceUnit>> {
  await syncConversationMemoryIndex(rootDir)
  const db = await openDatabase(join(resolve(rootDir), '.index', 'conversation-memory.sqlite'))
  try {
    const ids = [...new Set(unitIds)].filter(Boolean).slice(0, 100)
    if (!ids.length) return new Map()
    const rows = await all(
      db,
      `SELECT *, 0 AS relevance FROM evidence_units
        WHERE unit_id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    )
    return new Map(rows.map((row) => {
      const unit = mapEvidenceRow(row)
      return [unit.unitId, unit] as const
    }))
  } finally {
    await closeDatabase(db)
  }
}

export async function searchConversationMemory(
  rootDir: string,
  query: string,
  limit: number,
  options: ConversationMemorySearchOptions = {},
): Promise<ConversationMemorySearchResult[]> {
  await syncConversationMemoryIndex(rootDir)
  const db = await openDatabase(
    join(resolve(rootDir), '.index', 'conversation-memory.sqlite'),
  )
  try {
    const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 50))
    const candidateLimit = Math.max(boundedLimit * 3, 12)
    const ftsQuery = buildFtsQuery(query)
    let ftsRows: Array<Record<string, unknown>> = []
    if (ftsQuery) {
      ftsRows = await all(
        db,
        `SELECT path, heading, chunk_id, content,
                bm25(chunks_fts, 1.0, 0.4) AS rank
           FROM chunks_fts
          WHERE chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
        [ftsQuery, candidateLimit],
      )
    }

    // unicode61 treats a contiguous Han sentence as one token. Always add a
    // bounded substring candidate pass so conversational Chinese queries do
    // not require the summary to contain the entire original sentence.
    const recallTerms = extractConversationMemoryRecallTerms(query)
    const lexicalRows = recallTerms.length
      ? await searchConversationMemoryByTerms(db, recallTerms, candidateLimit)
      : []
    const excludedPaths = new Set(options.excludePaths ?? [])
    const rows = mergeSearchCandidates(
      ftsRows.filter((row) => !excludedPaths.has(String(row.path))),
      lexicalRows.filter((row) => !excludedPaths.has(String(row.path))),
      boundedLimit,
    )

    const results: ConversationMemorySearchResult[] = []
    for (const row of rows) {
      const detail = await get(
        db,
        'SELECT start_line, end_line FROM chunks WHERE id = ?',
        [String(row.chunk_id)],
      )
      results.push({
        path: String(row.path),
        heading: String(row.heading),
        startLine: Number(detail?.start_line ?? 1),
        endLine: Number(detail?.end_line ?? 1),
        content: String(row.content),
        score: Number(row.rank ?? 0),
      })
    }
    return results
  } finally {
    await closeDatabase(db)
  }
}

async function collectDocuments(rootDir: string): Promise<Array<{ path: string; content: string }>> {
  // MEMORY.md is a server-generated aggregate of sessions/*.md. Index only
  // the canonical session sources so duplicate projections do not consume the
  // recall limit or prompt budget.
  const paths: string[] = []
  try {
    const entries = await readdir(join(rootDir, 'sessions'), {
      withFileTypes: true,
    })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        paths.push(join(rootDir, 'sessions', entry.name))
      }
    }
  } catch {
    // The layout bootstrap will repair the directory on the next turn.
  }

  const documents: Array<{ path: string; content: string }> = []
  for (const path of paths) {
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch {
      continue
    }
    documents.push({ path, content })
  }
  return documents
}

export function extractConversationMemoryEvidenceUnits(
  relativePath: string,
  content: string,
): EvidenceUnit[] {
  return extractEvidenceUnits('', relativePath, content, true)
}

function extractEvidenceUnits(
  rootDir: string,
  path: string,
  content: string,
  pathIsRelative = false,
): EvidenceUnit[] {
  const normalized = content.replaceAll('\r\n', '\n')
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized)
  if (!frontmatterMatch) return []
  let metadata: Record<string, unknown>
  try {
    metadata = parseYaml(frontmatterMatch[1]) as Record<string, unknown>
  } catch {
    return []
  }
  const conversationId = String(metadata.conversation_id ?? '').trim()
  if (!conversationId) return []
  const revision = Number(metadata.revision ?? 0)
  const updatedAt = String(metadata.updated_at ?? '')
  const lastTurn = String(metadata.last_processed_turn ?? '').trim()
  const relativePath = pathIsRelative
    ? path.split(sep).join('/')
    : relative(rootDir, path).split(sep).join('/')
  const lines = frontmatterMatch[2].split('\n')
  const units: EvidenceUnit[] = []
  const occurrences = new Map<string, number>()
  let heading = '(document)'
  let paragraph: string[] = []
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (text) addUnit(text)
  }
  const addUnit = (raw: string) => {
    const text = raw.replace(/^[-*+]\s+/, '').trim()
    if (!text || /^No durable session facts/i.test(text)) return
    const contentHash = sha256(text)
    const occurrenceKey = `${heading}\0${contentHash}`
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1
    occurrences.set(occurrenceKey, occurrence)
    units.push({
      unitId: sha256(`${conversationId}:${heading}:${contentHash}:${occurrence}`),
      path: relativePath,
      conversationId,
      heading,
      content: text,
      contentHash,
      summaryRevision: Number.isFinite(revision) ? revision : 0,
      summaryUpdatedAt: updatedAt,
      // syncConversationMemoryIndex downgrades the first full rebuild. On a
      // later checkpoint, a new/changed unit can be attributed to the summary's
      // last processed turn while unchanged units retain their prior lineage.
      sourceTurnId: lastTurn && lastTurn !== 'bootstrap' ? lastTurn : null,
      sourcePrecision: lastTurn && lastTurn !== 'bootstrap' ? 'turn' : 'summary',
    })
  }
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line)
    if (h2) {
      flushParagraph()
      heading = h2[1]
      continue
    }
    if (/^[-*+]\s+/.test(line)) {
      flushParagraph()
      addUnit(line)
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      continue
    }
    if (!/^#/.test(line)) paragraph.push(line.trim())
  }
  flushParagraph()
  return units
}

function mapEvidenceRow(row: Record<string, unknown>): ConversationMemoryEvidenceUnit {
  return {
    unitId: String(row.unit_id),
    path: String(row.path),
    conversationId: String(row.conversation_id),
    heading: String(row.heading),
    content: String(row.content),
    contentHash: String(row.content_hash),
    summaryRevision: Number(row.summary_revision ?? 0),
    summaryUpdatedAt: String(row.summary_updated_at ?? ''),
    sourceTurnId: row.source_turn_id ? String(row.source_turn_id) : null,
    sourcePrecision: row.source_precision === 'turn' ? 'turn' : 'summary',
    score: Number(row.relevance ?? 0),
  }
}

export function chunkConversationMemoryMarkdown(
  relativePath: string,
  content: string,
): Chunk[] {
  return chunkMarkdown('', relativePath, content, true)
}

/**
 * Build bounded lexical terms for the non-FTS candidate pass. Latin words are
 * retained whole. Contiguous Han text is expanded into overlapping 2-4
 * character terms so natural questions can match concise summary wording.
 */
export function extractConversationMemoryRecallTerms(query: string): string[] {
  const normalized = query.normalize('NFKC').toLowerCase()
  const terms = new Set<string>()
  const wordTokens = normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []

  for (const token of wordTokens) {
    if (/\p{Script=Han}/u.test(token)) continue
    terms.add(token)
    if (terms.size >= MAX_RECALL_TERMS) return [...terms]
  }

  const hanSpans = normalized.match(/\p{Script=Han}{2,}/gu) ?? []
  for (const size of [4, 3, 2]) {
    for (const span of hanSpans) {
      if (span.length < size) continue
      for (let index = 0; index <= span.length - size; index += 1) {
        const term = span.slice(index, index + size)
        if (CJK_RECALL_STOP_TERMS.has(term)) continue
        terms.add(term)
        if (terms.size >= MAX_RECALL_TERMS) return [...terms]
      }
    }
  }

  return [...terms]
}

function chunkMarkdown(
  rootDir: string,
  path: string,
  content: string,
  pathIsRelative = false,
): Chunk[] {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const relativePath = pathIsRelative
    ? path.split(sep).join('/')
    : relative(rootDir, path).split(sep).join('/')
  const chunks: Chunk[] = []
  let heading = '(document)'
  let start = 0

  const flush = (endExclusive: number) => {
    const text = lines.slice(start, endExclusive).join('\n').trim()
    if (!text) return
    // Bound chunks while retaining heading context.
    for (let offset = 0; offset < endExclusive - start; offset += 40) {
      const chunkStart = start + offset
      const chunkEnd = Math.min(endExclusive, chunkStart + 50)
      const chunkContent = lines.slice(chunkStart, chunkEnd).join('\n').trim()
      if (!chunkContent) continue
      const id = sha256(
        `${relativePath}:${chunkStart + 1}:${chunkEnd}:${chunkContent}`,
      )
      chunks.push({
        id,
        path: relativePath,
        heading,
        startLine: chunkStart + 1,
        endLine: chunkEnd,
        content: chunkContent,
        hash: sha256(chunkContent),
      })
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(lines[index])
    if (!match) continue
    if (index > start) flush(index)
    heading = match[2]
    start = index
  }
  flush(lines.length)
  return chunks
}

function buildFtsQuery(query: string): string {
  const tokens = query
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]{2,}/gu)
    ?.slice(0, 12)
  if (!tokens?.length) return ''
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ')
}

async function searchConversationMemoryByTerms(
  db: sqlite3.Database,
  terms: string[],
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const rankExpressions: string[] = []
  const params: unknown[] = []
  for (const term of terms) {
    const weight = recallTermWeight(term)
    rankExpressions.push(
      `(CASE WHEN content LIKE ? ESCAPE '\\' THEN ${weight} ELSE 0 END + ` +
        `CASE WHEN heading LIKE ? ESCAPE '\\' THEN ${weight * 2} ELSE 0 END)`,
    )
    const pattern = `%${escapeLikeTerm(term)}%`
    params.push(pattern, pattern)
  }

  return all(
    db,
    `SELECT path, heading, chunk_id, content, rank
       FROM (
         SELECT path, heading, id AS chunk_id, content,
                ${rankExpressions.join(' + ')} AS rank
           FROM chunks
       )
      WHERE rank > 0
      ORDER BY rank DESC,
               CASE WHEN path LIKE 'sessions/%' THEN 0 ELSE 1 END,
               path
      LIMIT ?`,
    [...params, limit],
  )
}

function mergeSearchCandidates(
  ftsRows: Array<Record<string, unknown>>,
  lexicalRows: Array<Record<string, unknown>>,
  limit: number,
): Array<Record<string, unknown>> {
  const candidates = new Map<
    string,
    { row: Record<string, unknown>; relevance: number }
  >()

  for (const row of ftsRows) {
    const key = String(row.chunk_id)
    const bm25Rank = Number(row.rank ?? 0)
    candidates.set(key, {
      row,
      relevance: 20 + Math.max(0, -bm25Rank),
    })
  }

  for (const row of lexicalRows) {
    const key = String(row.chunk_id)
    const lexicalRelevance = Number(row.rank ?? 0)
    const existing = candidates.get(key)
    if (existing) {
      existing.relevance += lexicalRelevance
      continue
    }
    candidates.set(key, { row, relevance: lexicalRelevance })
  }

  return [...candidates.values()]
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        sourcePreference(left.row) - sourcePreference(right.row) ||
        String(left.row.path).localeCompare(String(right.row.path)),
    )
    .slice(0, limit)
    .map(({ row, relevance }) => ({ ...row, rank: relevance }))
}

function recallTermWeight(term: string): number {
  if (/^\p{Script=Han}+$/u.test(term)) return term.length * term.length
  return Math.max(2, Math.min(term.length, 12))
}

function escapeLikeTerm(term: string): string {
  return term
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
}

function sourcePreference(row: Record<string, unknown>): number {
  return String(row.path).startsWith('sessions/') ? 0 : 1
}

async function initializeSchema(db: sqlite3.Database): Promise<void> {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  )
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      heading TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL
    )`,
  )
  await run(
    db,
    `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      heading,
      path UNINDEXED,
      chunk_id UNINDEXED,
      tokenize = 'unicode61'
    )`,
  )
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS evidence_units (
      unit_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      heading TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      summary_revision INTEGER NOT NULL,
      summary_updated_at TEXT NOT NULL,
      source_turn_id TEXT,
      source_precision TEXT NOT NULL
    )`,
  )
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_evidence_units_conversation ON evidence_units(conversation_id)')
  await run(
    db,
    `CREATE VIRTUAL TABLE IF NOT EXISTS evidence_units_fts USING fts5(
      content,
      heading,
      conversation_id UNINDEXED,
      unit_id UNINDEXED,
      tokenize = 'unicode61'
    )`,
  )
}

function openDatabase(path: string): Promise<sqlite3.Database> {
  return new Promise((resolveOpen, reject) => {
    const db = new sqlite3.Database(path, (error) => {
      if (error) reject(error)
      else resolveOpen(db)
    })
  })
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolveClose, reject) => {
    db.close((error) => (error ? reject(error) : resolveClose()))
  })
}

function run(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    db.run(sql, params, (error) => (error ? reject(error) : resolveRun()))
  })
}

function all(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolveAll, reject) => {
    db.all(sql, params, (error, rows) =>
      error
        ? reject(error)
        : resolveAll(rows as Array<Record<string, unknown>>),
    )
  })
}

function get(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolveGet, reject) => {
    db.get(sql, params, (error, row) =>
      error ? reject(error) : resolveGet(row as Record<string, unknown>),
    )
  })
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
