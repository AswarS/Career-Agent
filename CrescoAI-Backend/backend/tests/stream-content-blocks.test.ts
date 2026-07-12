import { describe, expect, test } from 'bun:test'
import {
  initializeTextContentBlock,
  initializeThinkingContentBlock,
} from '../src/services/api/streamContentBlocks.js'

describe('stream content block initialization', () => {
  test('preserves text delivered in content_block_start', () => {
    const block = initializeTextContentBlock({
      type: 'text' as const,
      text: '{"',
      citations: [],
    })

    block.text += 'useSkill":true}'

    expect(block.text).toBe('{"useSkill":true}')
  })

  test('does not treat a matching delta prefix as duplicated start text', () => {
    const block = initializeTextContentBlock({
      type: 'text' as const,
      text: 'a',
    })

    block.text += 'apple'

    expect(block.text).toBe('aapple')
  })

  test('preserves a prefix delivered only in message_start content', () => {
    const block = initializeTextContentBlock({
      type: 'text' as const,
      text: '',
    }, '{')

    block.text += '"useSkill":true}'

    expect(block.text).toBe('{"useSkill":true}')
  })

  test('does not duplicate a message_start prefix repeated by content_block_start', () => {
    const block = initializeTextContentBlock({
      type: 'text' as const,
      text: '{"use',
    }, '{')

    expect(block.text).toBe('{"use')
  })

  test('preserves thinking delivered in content_block_start', () => {
    const block = initializeThinkingContentBlock({
      type: 'thinking' as const,
      thinking: 'initial reasoning',
      signature: 'initial-signature',
    })

    block.thinking += ' continued'

    expect(block.thinking).toBe('initial reasoning continued')
    expect(block.signature).toBe('initial-signature')
  })

  test('defaults a missing thinking signature without clearing thinking', () => {
    const block = initializeThinkingContentBlock({
      type: 'thinking' as const,
      thinking: 'initial reasoning',
    })

    expect(block).toEqual({
      type: 'thinking',
      thinking: 'initial reasoning',
      signature: '',
    })
  })
})
