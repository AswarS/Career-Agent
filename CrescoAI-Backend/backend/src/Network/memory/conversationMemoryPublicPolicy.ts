import { basename } from 'node:path'

const MIN_PRIVATE_IDENTIFIER_PREFIX_LENGTH = 8
const CONVERSATION_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const PUBLIC_IDENTIFIER_TOKEN_PATTERN =
  /(?:sessions[\\/])?([A-Za-z0-9][A-Za-z0-9_-]{7,127})(\.(?:jsonl|md))?/gi
const INTERNAL_IDENTIFIER_REPLACEMENT = '相关历史会话'
const STRUCTURAL_PUBLIC_VALUE_KEYS = new Set([
  'id',
  'uuid',
  'url',
  'href',
  'path',
  'filePath',
  'file_path',
  'toolUseId',
  'tool_use_id',
  'messageId',
  'message_id',
  'threadId',
  'thread_id',
  'conversationId',
  'conversation_id',
  'sessionId',
  'session_id',
])

export function createConversationMemoryPrivateIdentifiers(
  currentConversationId?: string,
): Set<string> {
  const identifiers = new Set<string>()
  addConversationMemoryPrivateIdentifier(identifiers, currentConversationId)
  return identifiers
}

export function addConversationMemoryPrivateIdentifier(
  identifiers: Set<string>,
  value: unknown,
): void {
  const normalized = normalizeConversationIdentifier(value)
  if (normalized) identifiers.add(normalized)
}

export function addConversationMemoryPrivateIdentifierFromPath(
  identifiers: Set<string>,
  path: unknown,
): void {
  if (typeof path !== 'string' || !path.trim()) return
  const fileName = basename(path.trim().replace(/\\/g, '/'))
  addConversationMemoryPrivateIdentifier(
    identifiers,
    fileName.replace(/\.(?:jsonl|md)$/i, ''),
  )
}

/**
 * Raw transcript projection needs to rediscover identifiers that were used by
 * internal Memory reads. Only explicit Memory metadata/path shapes are
 * collected so unrelated business UUIDs remain public.
 */
export function collectConversationMemoryPrivateIdentifiers(
  value: unknown,
  currentConversationId?: string,
): Set<string> {
  const identifiers = createConversationMemoryPrivateIdentifiers(
    currentConversationId,
  )
  const serialized = stringifyForInspection(value)
  if (!serialized) return identifiers

  const patterns = [
    /\bconversation_id:\s*([A-Za-z0-9_-]{8,128})/gi,
    /\btranscript_file:\s*([A-Za-z0-9_-]{8,128})\.jsonl\b/gi,
    /(?:^|[\\/])sessions[\\/]([A-Za-z0-9_-]{8,128})\.md\b/gi,
    /(?:^|[\\/])transcripts[\\/]([A-Za-z0-9_-]{8,128})\.jsonl\b/gi,
    /(?:^|\n)\s*#\s+([A-Za-z0-9_-]{8,128})\.jsonl\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of serialized.matchAll(pattern)) {
      addConversationMemoryPrivateIdentifier(identifiers, match[1])
    }
  }
  return identifiers
}

export function sanitizeConversationMemoryPublicText(
  input: string,
  privateConversationIds: ReadonlySet<string> | undefined,
): string {
  if (!input || !privateConversationIds?.size) return input
  const normalizedIds = [...privateConversationIds]
    .map((value) => normalizeConversationIdentifier(value))
    .filter((value): value is string => Boolean(value))
  if (!normalizedIds.length) return input

  // Persisted tool outputs live under the current conversation's own private
  // session directory. The agent must be able to Read the file back from the
  // exact path printed in the message, so exempt those sections from
  // identifier redaction.
  return input
    .split(/(<persisted-output>[\s\S]*?<\/persisted-output>)/g)
    .map((segment, index) =>
      index % 2 === 1
        ? segment
        : sanitizeIdentifierText(segment, normalizedIds),
    )
    .join('')
}

function sanitizeIdentifierText(
  input: string,
  normalizedIds: string[],
): string {
  let output = input.replace(
    PUBLIC_IDENTIFIER_TOKEN_PATTERN,
    (match, rawIdentifier: string) => {
      const candidate = normalizeConversationIdentifier(rawIdentifier)
      if (!candidate) return match
      const isPrivate = normalizedIds.some(
        (identifier) =>
          candidate === identifier ||
          (candidate.length >= MIN_PRIVATE_IDENTIFIER_PREFIX_LENGTH &&
            identifier.startsWith(candidate)),
      )
      return isPrivate ? INTERNAL_IDENTIFIER_REPLACEMENT : match
    },
  )

  return output
    .replace(
      new RegExp(
        `(?:会话|conversation|session)\\s*(?:id\\s*[:：-]?\\s*)?[\\u0060"'（(]*${INTERNAL_IDENTIFIER_REPLACEMENT}[\\u0060"'）)]*`,
        'gi',
      ),
      INTERNAL_IDENTIFIER_REPLACEMENT,
    )
    .replace(
      new RegExp(`${INTERNAL_IDENTIFIER_REPLACEMENT}\\.(?:jsonl|md)`, 'gi'),
      INTERNAL_IDENTIFIER_REPLACEMENT,
    )
}

export function containsConversationMemoryPrivateIdentifier(
  input: string,
  privateConversationIds: ReadonlySet<string> | undefined,
): boolean {
  return (
    sanitizeConversationMemoryPublicText(input, privateConversationIds) !==
    input
  )
}

export function sanitizeConversationMemoryPublicValue<T>(
  value: T,
  privateConversationIds: ReadonlySet<string> | undefined,
): T {
  if (typeof value === 'string') {
    return sanitizeConversationMemoryPublicText(
      value,
      privateConversationIds,
    ) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeConversationMemoryPublicValue(item, privateConversationIds),
    ) as T
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      STRUCTURAL_PUBLIC_VALUE_KEYS.has(key)
        ? item
        : sanitizeConversationMemoryPublicValue(item, privateConversationIds),
    ]),
  ) as T
}

function normalizeConversationIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return CONVERSATION_IDENTIFIER_PATTERN.test(normalized) ? normalized : null
}

function stringifyForInspection(value: unknown): string {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    return serialized.replace(/\\\\/g, '\\').replace(/\\n/g, '\n')
  } catch {
    return ''
  }
}
