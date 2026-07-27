export function initializeTextContentBlock<
  T extends { type: 'text'; text: string },
>(contentBlock: T, messageStartText = ''): T {
  // Anthropic-compatible providers do not all agree on where the initial text
  // belongs. Preserve a prefix carried by message_start.message.content as
  // well as content_block_start.text, then append later deltas normally.
  const blockStartText = contentBlock.text
  let text = blockStartText

  if (messageStartText) {
    if (!blockStartText) {
      text = messageStartText
    } else if (blockStartText.startsWith(messageStartText)) {
      text = blockStartText
    } else if (messageStartText.startsWith(blockStartText)) {
      text = messageStartText
    } else {
      text = `${messageStartText}${blockStartText}`
    }
  }

  return { ...contentBlock, text }
}

export function initializeThinkingContentBlock<
  T extends { type: 'thinking'; thinking: string; signature?: string },
>(contentBlock: T, messageStartThinking = ''): T & { signature: string } {
  const blockStartThinking = contentBlock.thinking
  let thinking = blockStartThinking
  if (messageStartThinking) {
    if (!blockStartThinking) {
      thinking = messageStartThinking
    } else if (blockStartThinking.startsWith(messageStartThinking)) {
      thinking = blockStartThinking
    } else if (messageStartThinking.startsWith(blockStartThinking)) {
      thinking = messageStartThinking
    } else {
      thinking = `${messageStartThinking}${blockStartThinking}`
    }
  }

  return {
    ...contentBlock,
    thinking,
    signature: contentBlock.signature ?? '',
  }
}
