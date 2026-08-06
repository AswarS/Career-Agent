export type ConversationMemoryWriteMode = 'observe' | 'required'

export type ConversationMemoryTurnState = {
  enabled: true
  userId: string
  conversationId: string
  rootDir: string
  sessionSummaryPath: string
  transcriptPath: string
  requiredTurnId: string
  committedTurnId?: string
  reminderCount: number
  maxReminders: number
  writeMode: ConversationMemoryWriteMode
  status: 'pending' | 'committed' | 'gate_exhausted'
  privateConversationIds: Set<string>
}

export type ConversationMemoryFrontmatter = {
  schema_version: number
  conversation_id: string
  transcript_file: string
  last_processed_turn: string
  updated_at: string
  revision: number
  topic_hooks: string[]
}

export type ConversationMemorySearchResult = {
  path: string
  heading: string
  startLine: number
  endLine: number
  content: string
  score: number
}

export type ConversationMemoryEvidencePrecision = 'turn' | 'summary'

/** Internal-only Profile evidence unit. Never expose path/conversationId directly. */
export type ConversationMemoryEvidenceUnit = {
  unitId: string
  path: string
  conversationId: string
  heading: string
  content: string
  contentHash: string
  summaryRevision: number
  summaryUpdatedAt: string
  sourceTurnId: string | null
  sourcePrecision: ConversationMemoryEvidencePrecision
  score: number
}

export type ProfileEvidenceSearchOptions = {
  limit?: number
  maxChars?: number
  excludeConversationIds?: Iterable<string>
}
