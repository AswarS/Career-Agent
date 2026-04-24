import type { ChatMessage } from '../types'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import SystemMessage from './SystemMessage'
import ResultMessage from './ResultMessage'

export default function MessageItem({ message }: { message: ChatMessage }) {
  switch (message.role) {
    case 'user': return <UserMessage message={message} />
    case 'assistant': return <AssistantMessage message={message} />
    case 'system': return <SystemMessage message={message} />
    case 'result': return <ResultMessage message={message} />
  }
}
