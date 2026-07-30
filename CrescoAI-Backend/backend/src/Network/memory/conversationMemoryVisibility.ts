import { isAbsolute, resolve } from 'node:path'
import { isPathWithinRoot } from '../../server/workspaceSecurity.js'

export const CONVERSATION_MEMORY_ORIGIN = 'conversation-memory'
export const CONVERSATION_MEMORY_REMINDER_MARKER =
  '<career-agent:conversation-memory-checkpoint>'

export type ConversationMemoryToolUseIds = Set<string>

/**
 * SDK messages use `isSynthetic` for internal `isMeta` user messages. Neither
 * shape is part of the public Network conversation trajectory.
 */
export function isInternalSdkMessage(value: unknown): boolean {
  const record = asRecord(value)
  return record?.isSynthetic === true || record?.isMeta === true
}

export function isConversationMemorySdkReminder(value: unknown): boolean {
  const record = asRecord(value)
  if (!record || (record.isSynthetic !== true && record.isMeta !== true)) {
    return false
  }
  const message = asRecord(record.message)
  return readMessageText(message?.content).includes(
    CONVERSATION_MEMORY_REMINDER_MARKER,
  )
}

export function isConversationMemoryTranscriptReminder(
  value: unknown,
): boolean {
  const record = asRecord(value)
  if (!record || record.isMeta !== true) return false
  const origin = asRecord(record.origin)
  if (origin?.kind === CONVERSATION_MEMORY_ORIGIN) return true
  const message = asRecord(record.message)
  return readMessageText(message?.content).includes(
    CONVERSATION_MEMORY_REMINDER_MARKER,
  )
}

export function isPublicTranscriptUserTurn(value: unknown): boolean {
  const record = asRecord(value)
  if (
    !record ||
    record.type !== 'user' ||
    isInternalTranscriptMessage(record)
  ) {
    return false
  }
  const message = asRecord(record.message)
  if (message?.role !== 'user' || record.toolUseResult !== undefined)
    return false
  const content = message.content
  if (!Array.isArray(content)) return typeof content === 'string'
  return !content.some((item) => {
    const block = asRecord(item)
    return (
      block?.type === 'tool_result' ||
      block?.tool_use_id !== undefined ||
      block?.toolUseId !== undefined
    )
  })
}

/** Raw transcript messages retain isMeta/origin and must stay model-visible. */
export function isInternalTranscriptMessage(value: unknown): boolean {
  const record = asRecord(value)
  if (!record) return false
  if (record.isMeta === true) return true
  const origin = asRecord(record.origin)
  return origin?.kind === CONVERSATION_MEMORY_ORIGIN
}

/**
 * Register and suppress tool_use blocks that target the private conversation
 * memory root. The raw tool blocks remain in QueryEngine history/JSONL.
 */
export function shouldSuppressConversationMemoryBlock(
  blockValue: unknown,
  conversationMemoryDir: string | undefined,
  hiddenToolUseIds: ConversationMemoryToolUseIds,
): boolean {
  const block = asRecord(blockValue)
  if (!block) return false

  if (isConversationMemoryToolUseBlock(block, conversationMemoryDir)) {
    const toolUseId = readToolUseId(block)
    if (toolUseId) hiddenToolUseIds.add(toolUseId)
    return true
  }

  const toolResultId = readToolResultId(block)
  return toolResultId !== null && hiddenToolUseIds.has(toolResultId)
}

export function collectConversationMemoryToolUseIds(
  blocks: unknown,
  conversationMemoryDir: string | undefined,
  hiddenToolUseIds: ConversationMemoryToolUseIds,
): boolean {
  if (!Array.isArray(blocks)) return false
  let found = false
  for (const blockValue of blocks) {
    const block = asRecord(blockValue)
    if (
      !block ||
      !isConversationMemoryToolUseBlock(block, conversationMemoryDir)
    ) {
      continue
    }
    found = true
    const toolUseId = readToolUseId(block)
    if (toolUseId) hiddenToolUseIds.add(toolUseId)
  }
  return found
}

/**
 * A model response whose tool calls are exclusively conversation-memory
 * maintenance is wholly internal, including adjacent thinking/text blocks.
 * Mixed public+memory tool envelopes retain public blocks and only suppress
 * the memory tool itself.
 */
export function isConversationMemoryMaintenanceMessage(
  blocks: unknown,
  conversationMemoryDir: string | undefined,
  hiddenToolUseIds: ConversationMemoryToolUseIds,
): boolean {
  if (!Array.isArray(blocks)) return false
  let foundMemoryTool = false
  let foundPublicTool = false
  for (const blockValue of blocks) {
    const block = asRecord(blockValue)
    if (!block || !isToolUseBlock(block)) continue
    if (isConversationMemoryToolUseBlock(block, conversationMemoryDir)) {
      foundMemoryTool = true
      const toolUseId = readToolUseId(block)
      if (toolUseId) hiddenToolUseIds.add(toolUseId)
    } else {
      foundPublicTool = true
    }
  }
  return foundMemoryTool && !foundPublicTool
}

export function isConversationMemoryToolUseBlock(
  block: Record<string, unknown>,
  conversationMemoryDir: string | undefined,
): boolean {
  if (!conversationMemoryDir || !isToolUseBlock(block)) return false
  const input = asRecord(block.input)
  if (!input) return false
  const candidate = readPath(input.file_path ?? input.path)
  if (!candidate) return false
  return isPathWithinRoot(candidate, resolve(conversationMemoryDir))
}

function isToolUseBlock(block: Record<string, unknown>): boolean {
  const type = typeof block.type === 'string' ? block.type : ''
  return type === 'tool_use' || type.endsWith('_tool_use')
}

function readToolUseId(block: Record<string, unknown>): string | null {
  return readNonEmptyString(block.id ?? block.tool_use_id ?? block.toolUseId)
}

function readToolResultId(block: Record<string, unknown>): string | null {
  const type = typeof block.type === 'string' ? block.type : ''
  if (
    type !== 'tool_result' &&
    !type.endsWith('_tool_result') &&
    block.tool_use_id === undefined &&
    block.toolUseId === undefined
  ) {
    return null
  }
  return readNonEmptyString(block.tool_use_id ?? block.toolUseId ?? block.id)
}

function readPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value)) {
    return null
  }
  return resolve(value)
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readMessageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => {
      const block = asRecord(item)
      return typeof block?.text === 'string'
        ? block.text
        : typeof block?.content === 'string'
          ? block.content
          : ''
    })
    .join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}
