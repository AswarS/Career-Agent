import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { careerAgentDatabasePath } from '../src/Network/database.config.js';
import {
  findNetworkTranscriptFile,
  getNetworkConversationMemoryDir,
  getNetworkTranscriptDir,
} from '../src/Network/utils/networkTranscriptStorage.js';
import {
  isConversationMemoryMaintenanceMessage,
  isInternalTranscriptMessage,
  shouldSuppressConversationMemoryBlock,
} from '../src/Network/memory/conversationMemoryVisibility.js';
import { sanitizeServerPhysicalPathsInValue } from '../src/Network/utils/publicOutputSanitizer.js';

type JsonRecord = Record<string, unknown>;

interface ConversationRow {
  id: string;
  userId: number;
  title: string | null;
  preview: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportOptions {
  userId: number;
  conversationId?: string;
  includeOrphans: boolean;
  outputDir: string;
}

interface TrainingMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

const SECRET_KEY = /(?:api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|password|secret|cookie|signature)/i;
const PRIVATE_REASONING_KEY = /^(?:thinking|reasoning|think)$/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const INLINE_SECRET = /\b(api[-_]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi;
const QUOTED_JSON_SECRET = /(["']?(?:api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|password|secret|cookie)["']?\s*:\s*)["'][^"']*["']/gi;

export function sanitizeTrajectoryValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return value
      .replace(BEARER_VALUE, 'Bearer [REDACTED]')
      .replace(QUOTED_JSON_SECRET, '$1"[REDACTED]"')
      .replace(INLINE_SECRET, '$1=[REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTrajectoryValue(item, seen));
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  const result: JsonRecord = {};
  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    if (PRIVATE_REASONING_KEY.test(key)) continue;
    result[key] = SECRET_KEY.test(key)
      ? '[REDACTED]'
      : sanitizeTrajectoryValue(nested, seen);
  }
  seen.delete(value);
  return result;
}

function timestampMs(event: JsonRecord, fallback: number): number {
  const parsed = Date.parse(String(event.timestamp ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function selectLatestBranch(events: JsonRecord[]): JsonRecord[] {
  const messages = events.filter((event) => {
    const uuid = event.uuid;
    return (
      (event.type === 'user' || event.type === 'assistant') &&
      typeof uuid === 'string' && uuid.length > 0
    );
  });
  if (messages.length < 2) return messages;

  const byUuid = new Map<string, JsonRecord>();
  const parentUuids = new Set<string>();
  messages.forEach((event) => {
    byUuid.set(String(event.uuid), event);
    if (typeof event.parentUuid === 'string' && event.parentUuid) {
      parentUuids.add(event.parentUuid);
    }
  });
  const leaves = messages
    .filter((event) => !parentUuids.has(String(event.uuid)))
    .sort((left, right) => timestampMs(left, messages.indexOf(left)) - timestampMs(right, messages.indexOf(right)));
  const latest = leaves.at(-1) ?? messages.at(-1)!;
  if (!latest.parentUuid) {
    return [...messages].sort((left, right) => timestampMs(left, messages.indexOf(left)) - timestampMs(right, messages.indexOf(right)));
  }

  const chain: JsonRecord[] = [];
  const visited = new Set<string>();
  let cursor: JsonRecord | undefined = latest;
  while (cursor) {
    const uuid = String(cursor.uuid);
    if (visited.has(uuid)) break;
    visited.add(uuid);
    chain.push(cursor);
    const parentUuid = cursor.parentUuid;
    cursor = typeof parentUuid === 'string' ? byUuid.get(parentUuid) : undefined;
  }
  return chain.reverse();
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function contentBlocks(event: JsonRecord): unknown[] {
  const message = asRecord(event.message);
  return Array.isArray(message?.content) ? message.content : [];
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      const block = asRecord(item);
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function safeJson(value: unknown): string {
  return JSON.stringify(sanitizeTrajectoryValue(value) ?? null);
}

function resultText(block: JsonRecord): string {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    const text = textFromContent(block.content);
    return text || safeJson(block.content);
  }
  return safeJson(block.content ?? block);
}

export function buildSftMessages(events: JsonRecord[]): {
  messages: TrainingMessage[];
  skillNames: string[];
  toolNames: string[];
} {
  const messages: TrainingMessage[] = [];
  const toolNameById = new Map<string, string>();
  const skillNames = new Set<string>();
  const toolNames = new Set<string>();

  for (const event of events) {
    if (isInternalTranscriptMessage(event)) continue;
    const message = asRecord(event.message);
    if (!message) continue;
    const blocks = contentBlocks(event).map(asRecord).filter((block): block is JsonRecord => Boolean(block));

    if (event.type === 'assistant') {
      const text = textFromContent(message.content);
      const toolCalls: TrainingMessage['tool_calls'] = [];
      for (const block of blocks) {
        if (block.type !== 'tool_use') continue;
        const id = typeof block.id === 'string' && block.id ? block.id : `tool-${toolCalls.length + 1}`;
        const name = typeof block.name === 'string' && block.name ? block.name : 'unknown_tool';
        toolNameById.set(id, name);
        toolNames.add(name);
        const input = asRecord(block.input) ?? {};
        if (name === 'Skill') {
          const skillName = input.skill ?? input.name;
          if (typeof skillName === 'string' && skillName.trim()) skillNames.add(skillName.trim());
        }
        toolCalls.push({
          id,
          type: 'function',
          function: { name, arguments: safeJson(input) },
        });
      }
      if (text || toolCalls.length) {
        messages.push({
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        });
      }
      continue;
    }

    if (event.type !== 'user') continue;
    const toolResults = blocks.filter((block) => block.type === 'tool_result');
    if (toolResults.length) {
      for (const block of toolResults) {
        const id = String(block.tool_use_id ?? block.toolUseId ?? block.id ?? 'unknown-tool-call');
        messages.push({
          role: 'tool',
          tool_call_id: id,
          ...(toolNameById.has(id) ? { name: toolNameById.get(id) } : {}),
          content: resultText(block),
        });
      }
      continue;
    }
    const text = textFromContent(message.content);
    if (text) messages.push({ role: 'user', content: text });
  }

  return {
    messages,
    skillNames: [...skillNames].sort(),
    toolNames: [...toolNames].sort(),
  };
}

function cleanTrajectoryEvents(events: JsonRecord[], userId: number): JsonRecord[] {
  const memoryDir = getNetworkConversationMemoryDir(userId);
  const hiddenToolUseIds = new Set<string>();
  const cleaned: JsonRecord[] = [];
  for (const event of events) {
    if (isInternalTranscriptMessage(event)) continue;
    const message = asRecord(event.message);
    const blocks = Array.isArray(message?.content) ? message.content : null;
    if (blocks && isConversationMemoryMaintenanceMessage(blocks, memoryDir, hiddenToolUseIds)) continue;

    const copy = structuredClone(event);
    const copyMessage = asRecord(copy.message);
    if (Array.isArray(copyMessage?.content)) {
      copyMessage.content = copyMessage.content.filter((item) => {
        const block = asRecord(item);
        if (!block) return true;
        if (block.type === 'thinking') return false;
        return !shouldSuppressConversationMemoryBlock(block, memoryDir, hiddenToolUseIds);
      });
      if (copyMessage.content.length === 0) continue;
    }
    const sanitized = sanitizeServerPhysicalPathsInValue(
      sanitizeTrajectoryValue(copy),
    );
    if (sanitized && typeof sanitized === 'object') cleaned.push(sanitized as JsonRecord);
  }
  return cleaned;
}

function readAll<T>(db: sqlite3.Database, sql: string, params: unknown[]): Promise<T[]> {
  return new Promise((resolveRows, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolveRows(rows as T[]));
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolveClose, reject) => {
    db.close((error) => error ? reject(error) : resolveClose());
  });
}

async function listConversations(options: ExportOptions): Promise<ConversationRow[]> {
  const db = new sqlite3.Database(careerAgentDatabasePath, sqlite3.OPEN_READONLY);
  try {
    const clauses = ['"userId" = ?'];
    const params: unknown[] = [options.userId];
    if (options.conversationId) {
      clauses.push('"id" = ?');
      params.push(options.conversationId);
    }
    return await readAll<ConversationRow>(
      db,
      `SELECT "id", "userId", "title", "preview", "status", "createdAt", "updatedAt"
       FROM "conversations" WHERE ${clauses.join(' AND ')} ORDER BY "createdAt" ASC`,
      params,
    );
  } finally {
    await closeDatabase(db);
  }
}

async function parseTranscript(path: string): Promise<JsonRecord[]> {
  const source = await readFile(path, 'utf8');
  const events: JsonRecord[] = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') events.push(parsed as JsonRecord);
    } catch (error) {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return events;
}

function parseArgs(argv: string[]): ExportOptions {
  let userId = 1;
  let conversationId: string | undefined;
  let includeOrphans = false;
  let outputDir = resolve('data', 'trajectory-exports', new Date().toISOString().replace(/[:.]/g, '-'));
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--user-id' && value) {
      userId = Number(value);
      index += 1;
    } else if (arg === '--conversation-id' && value) {
      conversationId = value;
      index += 1;
    } else if (arg === '--output-dir' && value) {
      outputDir = resolve(value);
      index += 1;
    } else if (arg === '--include-orphans') {
      includeOrphans = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun run trajectories:export [--user-id 1] [--conversation-id ID] [--include-orphans] [--output-dir PATH]');
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('--user-id must be a positive integer');
  return { userId, conversationId, includeOrphans, outputDir };
}

async function exportTrajectories(options: ExportOptions): Promise<void> {
  const conversations = await listConversations(options);
  const rowsById = new Map(conversations.map((row) => [row.id, row]));

  if (options.includeOrphans && !options.conversationId) {
    const transcriptDir = getNetworkTranscriptDir(options.userId);
    for (const entry of await readdir(transcriptDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const id = basename(entry.name, '.jsonl');
      if (!rowsById.has(id)) {
        rowsById.set(id, {
          id,
          userId: options.userId,
          title: null,
          preview: null,
          status: 'orphan-transcript',
          createdAt: '',
          updatedAt: '',
        });
      }
    }
  }

  await mkdir(options.outputDir, { recursive: true });
  const rawLines: string[] = [];
  const sftLines: string[] = [];
  const skipped: Array<{ conversationId: string; reason: string }> = [];
  let eventCount = 0;
  let messageCount = 0;

  for (const row of rowsById.values()) {
    let transcriptPath: string;
    try {
      transcriptPath = await findNetworkTranscriptFile(row.id, options.userId, { readOnly: true });
    } catch {
      skipped.push({ conversationId: row.id, reason: 'transcript not found' });
      continue;
    }
    const events = await parseTranscript(transcriptPath);
    const cleanedEvents = cleanTrajectoryEvents(events, options.userId);
    const latestBranch = selectLatestBranch(events);
    const cleanedBranch = cleanTrajectoryEvents(latestBranch, options.userId);
    const sft = buildSftMessages(cleanedBranch);
    const metadata = {
      user_id: options.userId,
      conversation_id: row.id,
      title: row.title,
      status: row.status,
      created_at: row.createdAt || null,
      updated_at: row.updatedAt || null,
      source: 'career-agent-network-transcript',
    };
    rawLines.push(JSON.stringify({ schema_version: '1.0', trajectory_id: row.id, metadata, events: cleanedEvents }));
    sftLines.push(JSON.stringify({
      schema_version: '1.0',
      trajectory_id: row.id,
      metadata,
      messages: sft.messages,
      skills: sft.skillNames,
      tools: sft.toolNames,
    }));
    eventCount += cleanedEvents.length;
    messageCount += sft.messages.length;
  }

  const rawPath = join(options.outputDir, 'raw_trajectory.jsonl');
  const sftPath = join(options.outputDir, 'sft_messages.jsonl');
  const manifestPath = join(options.outputDir, 'manifest.json');
  await writeFile(rawPath, rawLines.length ? `${rawLines.join('\n')}\n` : '', 'utf8');
  await writeFile(sftPath, sftLines.length ? `${sftLines.join('\n')}\n` : '', 'utf8');
  await writeFile(manifestPath, `${JSON.stringify({
    schema_version: '1.0',
    exported_at: new Date().toISOString(),
    database_file: basename(careerAgentDatabasePath),
    user_id: options.userId,
    conversation_id: options.conversationId ?? null,
    include_orphans: options.includeOrphans,
    trajectory_count: rawLines.length,
    event_count: eventCount,
    training_message_count: messageCount,
    skipped,
    files: {
      raw: basename(rawPath),
      sft: basename(sftPath),
    },
  }, null, 2)}\n`, 'utf8');

  console.log(`Exported ${rawLines.length} trajectory(s), ${eventCount} event(s), and ${messageCount} training message(s).`);
  console.log(`Output: ${options.outputDir}`);
  if (skipped.length) console.log(`Skipped ${skipped.length} conversation(s); see manifest.json.`);
}

if (import.meta.main) {
  exportTrajectories(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
