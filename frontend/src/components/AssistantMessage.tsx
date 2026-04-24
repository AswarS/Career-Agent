import type { ChatMessage, AssistantContentBlock } from '../types'
import TextBlock from './blocks/TextBlock'
import ThinkingBlock from './blocks/ThinkingBlock'
import ToolUseBlock from './blocks/ToolUseBlock'

export default function AssistantMessage({ message }: { message: ChatMessage }) {
  if (!message.blocks?.length) return null
  return (
    <div className="message assistant-message">
      {message.model && <div className="message-model">{message.model}</div>}
      {message.blocks.map((block, i) => (
        <ContentBlockRenderer key={i} block={block} />
      ))}
    </div>
  )
}

function ContentBlockRenderer({ block }: { block: AssistantContentBlock }) {
  switch (block.type) {
    case 'text': return <TextBlock block={block} />
    case 'thinking': return <ThinkingBlock block={block} />
    case 'tool_use': return <ToolUseBlock block={block} />
  }
}
