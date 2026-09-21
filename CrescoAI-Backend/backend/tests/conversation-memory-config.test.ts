import { afterEach, describe, expect, test } from 'bun:test'
import { isConversationMemoryEnabled } from '../src/Network/memory/conversationMemoryConfig.js'

const originalValue = process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED
  } else {
    process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED = originalValue
  }
})

describe('Conversation Memory configuration', () => {
  test('is disabled by default', () => {
    delete process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED
    expect(isConversationMemoryEnabled()).toBe(false)
  })

  test.each(['1', 'true', 'on', 'yes', ' TRUE '])(
    'can be explicitly enabled with %s',
    (value) => {
      process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED = value
      expect(isConversationMemoryEnabled()).toBe(true)
    },
  )

  test.each(['0', 'false', 'off', 'no', '', 'unexpected'])(
    'stays disabled for %s',
    (value) => {
      process.env.CAREER_AGENT_CONVERSATION_MEMORY_ENABLED = value
      expect(isConversationMemoryEnabled()).toBe(false)
    },
  )
})
