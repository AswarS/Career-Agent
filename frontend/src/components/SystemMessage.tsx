import type { ChatMessage } from '../types'

export default function SystemMessage({ message }: { message: ChatMessage }) {
  const levelClass = message.level ?? 'info'
  return (
    <div className={`message system-message ${levelClass}`}>
      <span className="system-level-badge">{levelClass}</span>
      <span>{message.message}</span>
    </div>
  )
}
