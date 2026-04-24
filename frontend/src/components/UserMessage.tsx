import type { ChatMessage } from '../types'

export default function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="message user-message">
      <div className="message-bubble user-bubble">{message.content}</div>
    </div>
  )
}
