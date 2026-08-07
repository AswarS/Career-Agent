import type { ThreadMessage } from '../../types/entities';

export interface InteractiveReplyBoundary {
  questionMessageId: string;
  continuationMessageId: string | null;
}

function hasRenderableContent(message: ThreadMessage) {
  if (message.content.trim()) {
    return true;
  }

  return Boolean(message.blocks?.some((block) => (
    block.type !== 'ask_question'
    && (
      Boolean(block.text?.trim())
      || Boolean(block.media?.length)
      || Boolean(block.files?.length)
      || Boolean(block.actions?.length)
    )
  )));
}

export function findInteractiveReplyBoundary(
  messages: ThreadMessage[],
  toolUseId: string,
): InteractiveReplyBoundary | null {
  const questionIndex = messages.findIndex((message) => (
    message.blocks?.some((block) => (
      block.type === 'ask_question' && block.toolUseId === toolUseId
    ))
  ));

  if (questionIndex < 0) {
    return null;
  }

  const continuationMessage = messages
    .slice(questionIndex + 1)
    .find(hasRenderableContent);

  return {
    questionMessageId: messages[questionIndex]!.id,
    continuationMessageId: continuationMessage?.id ?? null,
  };
}
