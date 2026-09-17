import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Database } from 'bun:sqlite';

type JsonObject = Record<string, any>;

const networkDir = join(import.meta.dir, '..', 'src', 'Network');
const userRoot = join(networkDir, 'user');
const databasePath = join(networkDir, 'data', 'test.sqlite');

function asDate(value: unknown, fallback: string): string {
  const candidate = typeof value === 'string' ? value : fallback;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function shorten(value: string, length: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > length ? `${compact.slice(0, length - 1)}…` : compact;
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((block) => {
      if (typeof block === 'string') return block;
      if (!block || typeof block !== 'object') return '';
      if (typeof block.text === 'string') return block.text;
      if (typeof block.content === 'string') return block.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function firstStringByKey(value: unknown, keys: Set<string>, depth = 0): string | undefined {
  if (depth > 5 || !value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringByKey(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, child] of Object.entries(value as JsonObject)) {
    if (keys.has(key) && typeof child === 'string' && child.trim()) return child;
    const found = firstStringByKey(child, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function parseProfileAttributes(comment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of comment.matchAll(/([a-z_]+)=([^\s]+)/g)) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

async function readJsonl(path: string): Promise<JsonObject[]> {
  const source = await readFile(path, 'utf8');
  const events: JsonObject[] = [];
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') events.push(value);
    } catch {
      // Keep the recoverable lines and skip a malformed event.
    }
  }
  return events;
}

async function findFiles(directory: string, suffix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(directory, entry.name));
}

async function main() {
  const userEntries = await readdir(userRoot, { withFileTypes: true });
  const userIds = userEntries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .sort((a, b) => a - b);

  if (!userIds.length) throw new Error(`No numeric user directories found under ${userRoot}`);

  const db = new Database(databasePath);
  const insert = (sql: string, params: unknown[]) => db.query(sql).run(...params);
  const count = (table: string) => Number(db.query(`SELECT count(*) AS count FROM "${table}"`).get().count);

  const existing = {
    users: count('users'),
    conversations: count('conversations'),
    artifacts: count('artifacts'),
  };
  if (existing.users || existing.conversations || existing.artifacts) {
    db.close();
    throw new Error(`Refusing to merge into a non-empty database: ${JSON.stringify(existing)}`);
  }

  const artifactRefs = new Map<string, { conversationId?: string; messageId?: string }>();
  const conversations: Array<JsonObject> = [];
  const users: Array<JsonObject> = [];
  const profiles: Array<JsonObject> = [];
  const memories: Array<JsonObject> = [];
  const profileItems: Array<JsonObject> = [];
  const artifacts: Array<JsonObject> = [];

  for (const userId of userIds) {
    const userDir = join(userRoot, String(userId));
    const transcriptDir = join(userDir, 'transcripts');
    const indexPaths = await findFiles(join(userDir, 'workspace', 'action_artifacts'), '.artifact-index.json');
    for (const indexPath of indexPaths) {
      const index = JSON.parse(await readFile(indexPath, 'utf8')) as JsonObject;
      if (String(index.user_id ?? userId) === String(userId) && index.artifact_uid) {
        artifactRefs.set(String(index.artifact_uid), artifactRefs.get(String(index.artifact_uid)) ?? {});
      }
    }
    const transcriptPaths = await findFiles(transcriptDir, '.jsonl');
    const transcriptData: Array<{ path: string; events: JsonObject[] }> = [];

    for (const transcriptPath of transcriptPaths) {
      const events = await readJsonl(transcriptPath);
      transcriptData.push({ path: transcriptPath, events });
      const timestamps = events
        .map((event) => event.timestamp)
        .filter((value): value is string => typeof value === 'string')
        .map((value) => asDate(value, '1970-01-01T00:00:00.000Z'))
        .sort();
      if (!timestamps.length) continue;
      const sessionId = basename(transcriptPath, '.jsonl');
      const publicUsers = events.filter(
        (event) => event.type === 'user' && event.isMeta !== true && textContent(event.message?.content),
      );
      const firstPrompt = textContent(publicUsers[0]?.message?.content);
      const lastPrompt = textContent(publicUsers.at(-1)?.message?.content);
      conversations.push({
        userId,
        id: sessionId,
        title: shorten(firstPrompt || sessionId, 96),
        preview: shorten(lastPrompt || firstPrompt || '', 240),
        createdAt: timestamps[0],
        updatedAt: timestamps.at(-1),
      });

      for (const event of events) {
        const raw = JSON.stringify(event);
        for (const [uid, current] of artifactRefs) {
          if (!current.conversationId && raw.includes(uid)) {
            artifactRefs.set(uid, {
              conversationId: sessionId,
              messageId: event.message?.id ?? event.uuid,
            });
          }
        }
      }
    }

    const profilePath = join(userDir, 'memory', 'profile.md');
    const profileSource = await readFile(profilePath, 'utf8').catch(() => '');
    const generatedAt = profileSource.match(/generated_at:\s*([^\s]+)/)?.[1];
    const profileVersion = Number(profileSource.match(/> version:\s*(\d+)/)?.[1] ?? 1);
    const owner = profileSource.match(/> owner:\s*(.+)/)?.[1]?.trim() ?? '';
    const memoryLines = profileSource.split('\n');
    const parsedItems: JsonObject[] = [];
    for (let index = 0; index < memoryLines.length; index += 1) {
      const comment = memoryLines[index].match(/^<!-- profile:item (.+) -->$/)?.[1];
      if (!comment) continue;
      const attributes = parseProfileAttributes(comment);
      const contentLine = memoryLines.slice(index + 1).find((line) => /^- \[P\d+\] /.test(line));
      if (!contentLine || !attributes.id) continue;
      const content = contentLine.replace(/^- \[[^\]]+\]\s*/, '').trim();
      const status = attributes.status ?? 'active';
      const profileIndex = attributes.index ?? null;
      const timeScope = attributes.level === 'L1' || attributes.expires_at ? 'short_term' : 'long_term';
      parsedItems.push({
        id: attributes.id,
        userId,
        profileIndex,
        profileLevel: attributes.level ?? 'L2',
        itemVersion: Number(attributes.version ?? 1),
        content,
        category: attributes.category ?? 'recovered',
        slotKey: attributes.slot ?? '',
        appliesToJson: '[]',
        timeScope,
        priority: attributes.priority ?? 'normal',
        sourceType: 'system_migration',
        sourceConversationId: null,
        sourceMessageId: null,
        status,
        expiresAt: attributes.expires_at ? asDate(attributes.expires_at, attributes.expires_at) : null,
        supersedesId: null,
        version: Number(attributes.version ?? 1),
        createdAt: asDate(generatedAt, '2026-01-01T00:00:00.000Z'),
        updatedAt: asDate(generatedAt, '2026-01-01T00:00:00.000Z'),
      });
    }
    for (const item of parsedItems.filter((candidate) => candidate.status === 'active')) {
      const previous = parsedItems.find(
        (candidate) => candidate.profileIndex === item.profileIndex && candidate.status === 'superseded',
      );
      if (previous) item.supersedesId = previous.id;
    }
    profileItems.push(...parsedItems);

    const memoryPath = join(userDir, 'memory', 'MEMORY.md');
    const memorySource = await readFile(memoryPath, 'utf8').catch(() => '');
    for (const line of memorySource.split('\n')) {
      const match = line.match(/^- \[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\s+(.+?)(?:（详见|$)/);
      if (!match) continue;
      memories.push({
        userId,
        content: match[4].trim(),
        category: 'recovered_profile_memory',
        tags: JSON.stringify(['recovered', match[2], match[3]]),
        createdAt: asDate(generatedAt, '2026-01-01T00:00:00.000Z'),
      });
    }

    const dates = conversations
      .filter((conversation) => conversation.userId === userId)
      .flatMap((conversation) => [conversation.createdAt, conversation.updatedAt])
      .filter(Boolean)
      .sort();
    const createdAt = dates[0] ?? asDate(generatedAt, '2026-01-01T00:00:00.000Z');
    const updatedAt = dates.at(-1) ?? asDate(generatedAt, createdAt);
    const activeItems = parsedItems.filter((item) => item.status === 'active');
    users.push({ userId, owner, profileVersion, createdAt, updatedAt, profilePath, memoryPath, activeItems });
    profiles.push({
      userId,
      owner,
      profileVersion,
      generatedAt: asDate(generatedAt, updatedAt),
      nextProfileIndex: Math.max(0, ...parsedItems.map((item) => Number(String(item.profileIndex ?? '').replace('P', '')) || 0)) + 1,
    });

    for (const indexPath of indexPaths) {
      const index = JSON.parse(await readFile(indexPath, 'utf8')) as JsonObject;
      if (String(index.user_id ?? userId) !== String(userId)) continue;
      const uid = String(index.artifact_uid);
      artifactRefs.set(uid, artifactRefs.get(uid) ?? {});
      const canonicalPath = String(index.canonical_path);
      const canonicalSource = await readFile(canonicalPath, 'utf8').catch(() => '');
      if (!canonicalSource) continue;
      const canonical = JSON.parse(canonicalSource) as JsonObject;
      const canonicalStat = await stat(canonicalPath);
      const metadata: JsonObject = {
        ...index,
        artifact_uid: uid,
        artifact_ref: index.artifact_ref ?? `artifact://${uid}`,
        ...((canonical.lineage && typeof canonical.lineage === 'object') ? canonical.lineage : {}),
      };
      const summary = firstStringByKey(canonical, new Set(['summary', 'description'])) ?? '';
      const title = firstStringByKey(canonical, new Set(['title', 'name'])) ?? `${index.artifact_type} ${uid.slice(0, 8)}`;
      artifacts.push({
        userId,
        uid,
        type: String(index.artifact_type),
        title: shorten(title, 180),
        summary: shorten(summary, 500),
        renderMode: index.presentation_path ? 'html' : 'json',
        payloadPath: String(index.artifact_ref ?? `artifact://${uid}`),
        storagePath: canonicalPath,
        mimeType: 'application/json',
        sizeBytes: canonicalStat.size,
        metadataJson: JSON.stringify(metadata),
        createdAt: asDate(index.created_at, asDate(canonical.created_at, updatedAt)),
      });
    }

    // Keep transcriptData alive until artifact references have been indexed.
    void transcriptData;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const user of users) {
      const publicUserId = `00000000-0000-4000-8000-${String(user.userId).padStart(12, '0')}`;
      insert(
        `INSERT INTO users (id, userId, publicUserId, displayName, profileJson, tokenVersion, accountStatus, accountVersion, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 0, 'active', 1, ?, ?)`,
        [
          user.userId,
          String(user.userId),
          publicUserId,
          user.owner || null,
          JSON.stringify({ recovered: true, source: user.profilePath, profileVersion: user.profileVersion, activeItems: user.activeItems }),
          user.createdAt,
          user.updatedAt,
        ],
      );
    }

    for (const conversation of conversations) {
      insert(
        `INSERT INTO conversations (id, userId, title, preview, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        [conversation.id, conversation.userId, conversation.title, conversation.preview, conversation.createdAt, conversation.updatedAt],
      );
    }

    for (const memory of memories) {
      insert(
        `INSERT INTO memories (userId, content, category, tags, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [memory.userId, memory.content, memory.category, memory.tags, memory.createdAt],
      );
    }

    for (const item of profileItems) {
      insert(
        `INSERT INTO profile_memory_items
          (id, userId, profileIndex, profileLevel, itemVersion, content, normalizedKey, category, slotKey,
           appliesToJson, timeScope, priority, sourceType, sourceConversationId, sourceMessageId, status,
           expiresAt, supersedesId, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.userId, item.profileIndex, item.profileLevel, item.itemVersion, item.content,
          `${item.slotKey}:${item.profileIndex ?? item.id}`, item.category, item.slotKey, item.appliesToJson,
          item.timeScope, item.priority, item.sourceType, item.sourceConversationId, item.sourceMessageId,
          item.status, item.expiresAt, item.supersedesId, item.version, item.createdAt, item.updatedAt,
        ],
      );
    }

    for (const profile of profiles) {
      insert(
        `INSERT INTO user_profiles (userId, name, version, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        [profile.userId, profile.owner, profile.profileVersion, profile.generatedAt, profile.generatedAt],
      );
      insert(
        `INSERT INTO profile_states (userId, aggregateVersion, projectionVersion, projectionStatus, updatedAt, nextProfileIndex)
         VALUES (?, ?, ?, 'current', ?, ?)`,
        [profile.userId, profile.profileVersion, profile.profileVersion, profile.generatedAt, profile.nextProfileIndex],
      );
    }

    for (const artifact of artifacts) {
      const reference = artifactRefs.get(artifact.uid) ?? {};
      insert(
        `INSERT INTO artifacts
          (userId, conversationId, messageId, type, kind, title, status, renderMode, summary,
           payloadPath, storagePath, mimeType, sizeBytes, metadataJson, createdAt)
         VALUES (?, ?, ?, ?, 'action-artifact', ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          artifact.userId,
          reference.conversationId ?? null,
          reference.messageId ?? null,
          artifact.type,
          artifact.title,
          artifact.renderMode,
          artifact.summary,
          artifact.payloadPath,
          artifact.storagePath,
          artifact.mimeType,
          artifact.sizeBytes,
          artifact.metadataJson,
          artifact.createdAt,
        ],
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }

  console.log(JSON.stringify({
    databasePath,
    restored: {
      users: users.length,
      conversations: conversations.length,
      memories: memories.length,
      profileItems: profileItems.length,
      artifacts: artifacts.length,
    },
  }, null, 2));
}

await main();
