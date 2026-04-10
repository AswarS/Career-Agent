import type { ThreadMessage } from '../../types/entities';

const inlineThinkPattern = /<think>([\s\S]*?)<\/think>/gi;

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
    reasoning: reasoning || null,
  };
}

export function getPresentedMessageContent(message: ThreadMessage): { content: string; reasoning: string | null } {
  if (message.role !== 'assistant') {
    return {
      content: message.content,
      reasoning: message.reasoning ?? null,
    };
  }

  if (message.reasoning) {
    return {
      content: message.content,
      reasoning: message.reasoning,
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
