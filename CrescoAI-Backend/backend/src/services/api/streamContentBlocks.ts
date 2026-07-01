export function initializeTextContentBlock<
  T extends { type: 'text'; text: string },
>(contentBlock: T): T {
  // Raw stream events may carry output in content_block_start. Preserve it and
  // let the caller append every later delta in order, matching SDK semantics.
  return { ...contentBlock }
}

export function initializeThinkingContentBlock<
  T extends { type: 'thinking'; thinking: string; signature?: string },
>(contentBlock: T): T & { signature: string } {
  return {
    ...contentBlock,
    signature: contentBlock.signature ?? '',
  }
}
