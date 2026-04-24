import { useState } from 'react'
import { useApp } from '../hooks/useApp'

export default function MessageInput() {
  const { sendMessage, activeSession } = useApp()
  const [text, setText] = useState('')
  const isStreaming = activeSession?.isStreaming ?? false

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    setText('')
    sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e)
    }
  }

  return (
    <form className="message-input-form" onSubmit={handleSubmit}>
      <textarea
        className="message-input"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Ctrl+Enter to send)"
        disabled={isStreaming}
        rows={1}
      />
      <button type="submit" className="btn-send" disabled={isStreaming || !text.trim()}>
        {isStreaming ? '...' : '➤'}
      </button>
    </form>
  )
}
