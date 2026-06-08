import type { ThreadMessage } from '../../types/entities';

const inlineThinkPattern = /<think>([\s\S]*?)<\/think>/gi;
const invalidReasoningPattern = /^(?:null|undefined|none|n\/a|error|exception|failed|unavailable|not available|暂无|无)$/i;

function normalizeReasoning(reasoning: string | null | undefined) {
  if (typeof reasoning !== 'string') {
    return null;
  }

  const nextValue = reasoning.trim();
  if (!nextValue || invalidReasoningPattern.test(nextValue)) {
    return null;
  }

  return nextValue;
}

function extractInlineReasoning(content: string): { content: string; reasoning: string | null } {
  const matches = [...content.matchAll(inlineThinkPattern)];

  if (matches.length === 0) {
    return {
      content,
      reasoning: null,
    };
  }

  const reasoning = matches
    .map((match) => match[1]?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .join('\n\n');

  return {
    content: content.replace(inlineThinkPattern, '').trim(),
    reasoning: normalizeReasoning(reasoning),
  };
}

export function getPresentedMessageContent(message: ThreadMessage): { content: string; reasoning: string | null } {
  if (message.role !== 'assistant') {
    return {
      content: message.content,
      reasoning: normalizeReasoning(message.reasoning),
    };
  }

  if (message.reasoning) {
    return {
      content: message.content,
      reasoning: normalizeReasoning(message.reasoning),
    };
  }

  return extractInlineReasoning(message.content);
}

export function shouldUseMultiAgentPresentation(messages: ThreadMessage[]): boolean {
  const assistantIdentities = new Set(
    messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.agentId ?? message.agentName ?? null)
      .filter((identity): identity is string => Boolean(identity)),
  );

  return assistantIdentities.size > 1;
}
