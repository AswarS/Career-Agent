import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import sqlite3 from 'sqlite3';
import { careerAgentDatabasePath } from '../src/Network/database.config.js';
import { getNetworkTranscriptDir } from '../src/Network/utils/networkTranscriptStorage.js';

type JsonRecord = Record<string, unknown>;

interface TokenUsage {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  processedInput: number;
  total: number;
}

interface ApiCallHotspot extends TokenUsage {
  conversationId: string;
  title: string | null;
  eventId: string | null;
  timestamp: string | null;
  model: string | null;
  stopReason: string | null;
  tools: string[];
}

interface PayloadHotspot {
  conversationId: string;
  title: string | null;
  eventId: string | null;
  timestamp: string | null;
  category: string;
  estimatedTokens: number;
  characters: number;
}

interface TrajectoryStats extends TokenUsage {
  conversationId: string;
  title: string | null;
  apiCalls: number;
  payloadEstimatedTokens: number;
  payloadByCategory: Record<string, number>;
}

interface AnalyzeOptions {
  userId: number;
  conversationId?: string;
  top: number;
  jsonPath?: string;
}

const emptyUsage = (): TokenUsage => ({
  input: 0,
  cacheCreation: 0,
  cacheRead: 0,
  output: 0,
  processedInput: 0,
  total: 0,
});

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function normalizeUsage(value: unknown): TokenUsage | null {
  const usage = asRecord(value);
  if (!usage) return null;
  const input = numberValue(usage.input_tokens ?? usage.inputTokens);
  const cacheCreation = numberValue(
    usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens,
  );
  const cacheRead = numberValue(
    usage.cache_read_input_tokens ?? usage.cacheReadInputTokens,
  );
  const output = numberValue(usage.output_tokens ?? usage.outputTokens);
  if (input + cacheCreation + cacheRead + output === 0) return null;
  const processedInput = input + cacheCreation + cacheRead;
  return {
    input,
    cacheCreation,
    cacheRead,
    output,
    processedInput,
    total: processedInput + output,
  };
}

function addUsage(target: TokenUsage, usage: TokenUsage): void {
  target.input += usage.input;
  target.cacheCreation += usage.cacheCreation;
  target.cacheRead += usage.cacheRead;
  target.output += usage.output;
  target.processedInput += usage.processedInput;
  target.total += usage.total;
}

/**
 * Portable approximation for payloads that do not carry provider usage.
 * CJK characters are usually close to one token; other text averages near
 * four characters per token. Exact model usage is always reported separately.
 */
export function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const nonCjk = text.length - cjk;
  return Math.max(1, Math.ceil(cjk + nonCjk / 4));
}

export function distribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (ratio: number) => {
    if (!sorted.length) return 0;
    return sorted[Math.floor((sorted.length - 1) * ratio)];
  };
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    sum,
    min: sorted[0] ?? 0,
    mean: sorted.length ? Math.round(sum / sorted.length) : 0,
    p25: percentile(0.25),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? 0,
  };
}

export function histogram(values: number[]) {
  const buckets = [
    { label: '<10k', min: 0, max: 10_000 },
    { label: '10k-50k', min: 10_000, max: 50_000 },
    { label: '50k-100k', min: 50_000, max: 100_000 },
    { label: '100k-250k', min: 100_000, max: 250_000 },
    { label: '250k-1m', min: 250_000, max: 1_000_000 },
    { label: '>=1m', min: 1_000_000, max: Number.POSITIVE_INFINITY },
  ];
  return buckets.map((bucket) => ({
    bucket: bucket.label,
    count: values.filter((value) => value >= bucket.min && value < bucket.max).length,
  }));
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    const block = asRecord(item);
    if (!block) return '';
    if (typeof block.text === 'string') return block.text;
    if (typeof block.content === 'string') return block.content;
    return '';
  }).filter(Boolean).join('\n');
}

function payloadValue(block: JsonRecord): unknown {
  if (block.type === 'tool_use') return block.input ?? {};
  if (block.type === 'tool_result') return block.content ?? block;
  if (block.type === 'thinking') return block.thinking ?? '';
  if (block.type === 'text') return block.text ?? '';
  return block.content ?? block.text ?? block;
}

function payloadCategory(
  event: JsonRecord,
  block: JsonRecord | null,
  toolNameById: Map<string, string>,
): string {
  if (event.isMeta === true) return 'internal_meta';
  if (!block) return event.type === 'assistant' ? 'assistant_text' : 'user_text';
  if (block.type === 'thinking') return 'assistant_thinking';
  if (block.type === 'text') return event.type === 'assistant' ? 'assistant_text' : 'user_text';
  if (block.type === 'tool_use') {
    const name = typeof block.name === 'string' ? block.name : 'unknown_tool';
    return `tool_input:${name}`;
  }
  if (block.type === 'tool_result') {
    const id = String(block.tool_use_id ?? block.toolUseId ?? block.id ?? '');
    return `tool_result:${toolNameById.get(id) ?? 'unknown_tool'}`;
  }
  return `content:${String(block.type ?? 'unknown')}`;
}

function parseEvents(source: string, path: string): JsonRecord[] {
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

export function analyzeEvents(
  conversationId: string,
  title: string | null,
  events: JsonRecord[],
): { trajectory: TrajectoryStats; calls: ApiCallHotspot[]; payloads: PayloadHotspot[] } {
  const totals = emptyUsage();
  const calls: ApiCallHotspot[] = [];
  const payloads: PayloadHotspot[] = [];
  const payloadByCategory: Record<string, number> = {};
  const toolNameById = new Map<string, string>();

  for (const event of events) {
    const message = asRecord(event.message);
    const blocks = Array.isArray(message?.content)
      ? message.content.map(asRecord).filter((block): block is JsonRecord => Boolean(block))
      : [];

    for (const block of blocks) {
      if (block.type === 'tool_use' && typeof block.id === 'string') {
        toolNameById.set(block.id, typeof block.name === 'string' ? block.name : 'unknown_tool');
      }
    }

    const usage = normalizeUsage(message?.usage);
    if (usage) {
      addUsage(totals, usage);
      const tools = blocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => typeof block.name === 'string' ? block.name : 'unknown_tool');
      calls.push({
        conversationId,
        title,
        eventId: typeof event.uuid === 'string' ? event.uuid : null,
        timestamp: typeof event.timestamp === 'string' ? event.timestamp : null,
        model: typeof message?.model === 'string' ? message.model : null,
        stopReason: typeof message?.stop_reason === 'string' ? message.stop_reason : null,
        tools,
        ...usage,
      });
    }

    if (!blocks.length && message?.content !== undefined) {
      const value = contentText(message.content);
      if (value) {
        const category = payloadCategory(event, null, toolNameById);
        const estimatedTokens = estimateTokens(value);
        payloadByCategory[category] = (payloadByCategory[category] ?? 0) + estimatedTokens;
        payloads.push({
          conversationId,
          title,
          eventId: typeof event.uuid === 'string' ? event.uuid : null,
          timestamp: typeof event.timestamp === 'string' ? event.timestamp : null,
          category,
          estimatedTokens,
          characters: value.length,
        });
      }
      continue;
    }

    for (const block of blocks) {
      const value = payloadValue(block);
      const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      if (!serialized) continue;
      const category = payloadCategory(event, block, toolNameById);
      const estimatedTokens = estimateTokens(serialized);
      payloadByCategory[category] = (payloadByCategory[category] ?? 0) + estimatedTokens;
      payloads.push({
        conversationId,
        title,
        eventId: typeof event.uuid === 'string' ? event.uuid : null,
        timestamp: typeof event.timestamp === 'string' ? event.timestamp : null,
        category,
        estimatedTokens,
        characters: serialized.length,
      });
    }
  }

  return {
    trajectory: {
      conversationId,
      title,
      apiCalls: calls.length,
      payloadEstimatedTokens: Object.values(payloadByCategory).reduce((sum, value) => sum + value, 0),
      payloadByCategory,
      ...totals,
    },
    calls,
    payloads,
  };
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

async function loadTitles(userId: number): Promise<Map<string, string | null>> {
  const db = new sqlite3.Database(careerAgentDatabasePath, sqlite3.OPEN_READONLY);
  try {
    const rows = await readAll<{ id: string; title: string | null }>(
      db,
      'SELECT "id", "title" FROM "conversations" WHERE "userId" = ?',
      [userId],
    );
    return new Map(rows.map((row) => [row.id, row.title]));
  } finally {
    await closeDatabase(db);
  }
}

function parseArgs(argv: string[]): AnalyzeOptions {
  let userId = 1;
  let conversationId: string | undefined;
  let top = 10;
  let jsonPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--user-id' && value) {
      userId = Number(value);
      index += 1;
    } else if (arg === '--conversation-id' && value) {
      conversationId = value;
      index += 1;
    } else if (arg === '--top' && value) {
      top = Number(value);
      index += 1;
    } else if (arg === '--json' && value) {
      jsonPath = resolve(value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: bun run trajectories:tokens [--user-id 1] [--conversation-id ID] [--top 10] [--json PATH]');
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('--user-id must be a positive integer');
  if (!Number.isSafeInteger(top) || top < 1 || top > 100) throw new Error('--top must be an integer from 1 to 100');
  return { userId, conversationId, top, jsonPath };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 8) : '-';
}

async function analyze(options: AnalyzeOptions) {
  const transcriptDir = getNetworkTranscriptDir(options.userId);
  const titles = await loadTitles(options.userId);
  const entries = (await readdir(transcriptDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .filter((entry) => !options.conversationId || basename(entry.name, '.jsonl') === options.conversationId);
  if (!entries.length) throw new Error('No matching transcript files found');

  const trajectories: TrajectoryStats[] = [];
  const calls: ApiCallHotspot[] = [];
  const payloads: PayloadHotspot[] = [];
  for (const entry of entries) {
    const conversationId = basename(entry.name, '.jsonl');
    const path = join(transcriptDir, entry.name);
    const result = analyzeEvents(
      conversationId,
      titles.get(conversationId) ?? null,
      parseEvents(await readFile(path, 'utf8'), path),
    );
    trajectories.push(result.trajectory);
    calls.push(...result.calls);
    payloads.push(...result.payloads);
  }

  const totalUsage = emptyUsage();
  trajectories.forEach((trajectory) => addUsage(totalUsage, trajectory));
  const categoryTotals = new Map<string, number>();
  for (const trajectory of trajectories) {
    for (const [category, tokens] of Object.entries(trajectory.payloadByCategory)) {
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + tokens);
    }
  }
  const topTrajectories = [...trajectories].sort((a, b) => b.total - a.total).slice(0, options.top);
  const topCalls = [...calls].sort((a, b) => b.total - a.total).slice(0, options.top);
  const topPayloads = [...payloads].sort((a, b) => b.estimatedTokens - a.estimatedTokens).slice(0, options.top);
  const topCategories = [...categoryTotals.entries()]
    .map(([category, estimatedTokens]) => ({ category, estimatedTokens }))
    .sort((a, b) => b.estimatedTokens - a.estimatedTokens);
  const report = {
    schema_version: '1.0',
    analyzed_at: new Date().toISOString(),
    user_id: options.userId,
    conversation_id: options.conversationId ?? null,
    notes: {
      exact_usage: 'Provider-reported usage. processed_input = input + cache_creation + cache_read.',
      payload_estimate: 'CJK ~= 1 token/character; other text ~= 1 token/4 characters. Used only to locate content hotspots.',
    },
    totals: { api_calls: calls.length, ...totalUsage },
    trajectory_distribution: distribution(trajectories.map((item) => item.total)),
    api_call_distribution: distribution(calls.map((item) => item.total)),
    trajectory_histogram: histogram(trajectories.map((item) => item.total)),
    top_trajectories: topTrajectories,
    payload_categories: topCategories,
    top_api_calls: topCalls,
    top_payloads: topPayloads,
  };

  console.log('\nToken usage summary (provider-reported)');
  console.log(`Trajectories: ${trajectories.length}; API calls: ${calls.length}`);
  console.log(`Processed input: ${formatNumber(totalUsage.processedInput)} (uncached ${formatNumber(totalUsage.input)}, cache creation ${formatNumber(totalUsage.cacheCreation)}, cache read ${formatNumber(totalUsage.cacheRead)})`);
  console.log(`Output: ${formatNumber(totalUsage.output)}; Total processed: ${formatNumber(totalUsage.total)}`);
  const trajectoryDistribution = report.trajectory_distribution;
  console.log(`Per trajectory: min ${formatNumber(trajectoryDistribution.min)}, p50 ${formatNumber(trajectoryDistribution.p50)}, p90 ${formatNumber(trajectoryDistribution.p90)}, p95 ${formatNumber(trajectoryDistribution.p95)}, max ${formatNumber(trajectoryDistribution.max)}`);
  const callDistribution = report.api_call_distribution;
  console.log(`Per API call: p50 ${formatNumber(callDistribution.p50)}, p90 ${formatNumber(callDistribution.p90)}, p95 ${formatNumber(callDistribution.p95)}, max ${formatNumber(callDistribution.max)}`);

  console.log('\nWorst trajectories');
  topTrajectories.forEach((item, index) => {
    console.log(`${index + 1}. ${shortId(item.conversationId)} ${item.title ?? '(orphan)'} | total=${formatNumber(item.total)} input=${formatNumber(item.processedInput)} output=${formatNumber(item.output)} calls=${item.apiCalls}`);
  });

  console.log('\nLargest payload categories (estimated)');
  topCategories.slice(0, options.top).forEach((item, index) => {
    console.log(`${index + 1}. ${item.category} | ~${formatNumber(item.estimatedTokens)} tokens`);
  });

  console.log('\nWorst API calls');
  topCalls.forEach((item, index) => {
    console.log(`${index + 1}. ${shortId(item.conversationId)}/${shortId(item.eventId)} | total=${formatNumber(item.total)} input=${formatNumber(item.processedInput)} output=${formatNumber(item.output)} tools=${item.tools.join(',') || '-'}`);
  });

  console.log('\nLargest individual payloads (estimated)');
  topPayloads.forEach((item, index) => {
    console.log(`${index + 1}. ${shortId(item.conversationId)}/${shortId(item.eventId)} ${item.category} | ~${formatNumber(item.estimatedTokens)} tokens`);
  });

  if (options.jsonPath) {
    await mkdir(dirname(options.jsonPath), { recursive: true });
    await writeFile(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nJSON report: ${options.jsonPath}`);
  }
  return report;
}

if (import.meta.main) {
  analyze(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
