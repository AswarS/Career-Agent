import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import sqlite3 from 'sqlite3'
import type { ConversationMemorySearchResult } from './conversationMemoryTypes.js'

const INDEX_SCHEMA_VERSION = '1'
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
    const chunks = await collectChunks(canonicalRoot)
    await run(db, 'BEGIN IMMEDIATE')
    try {
      await run(db, 'DELETE FROM chunks')
      await run(db, 'DELETE FROM chunks_fts')
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

async function collectChunks(rootDir: string): Promise<Chunk[]> {
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

  const chunks: Chunk[] = []
  for (const path of paths) {
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch {
      continue
    }
    chunks.push(...chunkMarkdown(rootDir, path, content))
  }
  return chunks
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
