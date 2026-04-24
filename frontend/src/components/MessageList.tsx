import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import MessageItem from './MessageItem'

export default function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="message-list">
      {messages.length === 0 && (
        <div className="empty-state">Send a message to start.</div>
      )}
      {messages.map(msg => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
