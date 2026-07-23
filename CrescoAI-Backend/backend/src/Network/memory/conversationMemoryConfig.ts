import type { ConversationMemoryWriteMode } from './conversationMemoryTypes.js'

function isExplicitlyFalse(value: string | undefined): boolean {
  return value !== undefined && /^(0|false|off|no)$/i.test(value.trim())
}

export function isConversationMemoryEnabled(): boolean {
  return !isExplicitlyFalse(
    process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED,
  )
}

export function getConversationMemoryWriteMode(): ConversationMemoryWriteMode {
  return process.env.CAREER_AGENT_CONVERSATION_MEMORY_WRITE_MODE === 'observe'
    ? 'observe'
    : 'required'
}

export function getConversationMemoryMaxReminders(): number {
  const parsed = Number.parseInt(
    process.env.CAREER_AGENT_CONVERSATION_MEMORY_MAX_REMINDERS ?? '2',
    10,
  )
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 5)) : 2
}

export function getConversationMemoryRecallLimit(): number {
  const parsed = Number.parseInt(
    process.env.CAREER_AGENT_CONVERSATION_MEMORY_RECALL_LIMIT ?? '6',
    10,
  )
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 12)) : 6
}

export function getConversationMemoryRecallCharBudget(): number {
  const parsed = Number.parseInt(
    process.env.CAREER_AGENT_CONVERSATION_MEMORY_RECALL_CHARS ?? '6000',
    10,
  )
  return Number.isFinite(parsed)
    ? Math.max(1000, Math.min(parsed, 20_000))
    : 6000
}
