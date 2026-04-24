import { useApp } from '../hooks/useApp'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import StateIndicator from './StateIndicator'

export default function ChatPanel() {
  const { activeSession } = useApp()

  if (!activeSession) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <h2>Claude Code</h2>
          <p>Select or create a session to start chatting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-panel-inner">
      <div className="chat-header">
        <span className="chat-header-cwd">{activeSession.cwd}</span>
        <StateIndicator state={activeSession.state} />
      </div>
      <MessageList messages={activeSession.messages} />
      <MessageInput />
    </div>
  )
}
