import { useState } from 'react'
import { useApp } from '../hooks/useApp'

export default function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const { createSession, currentUserId, setCurrentUserId } = useApp()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [cwd, setCwd] = useState('')
  const [userId, setUserId] = useState(currentUserId)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Save userId as current user identity
    if (userId && userId !== currentUserId) {
      setCurrentUserId(userId)
    }
    await createSession({
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      model: model || undefined,
      cwd: cwd || undefined,
      userId: userId || undefined,
      permissions: { mode: 'allow_all' },
    })
    setLoading(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>New Session</h3>
        <form onSubmit={handleSubmit}>
          <label>
            User ID <span className="hint">(required for isolation)</span>
            <input type="text" value={userId} onChange={e => setUserId(e.target.value)}
              placeholder="alice" />
          </label>
          <label>
            API Key <span className="hint">(optional)</span>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..." />
          </label>
          <label>
            Base URL <span className="hint">(optional, for third-party API proxies)</span>
            <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1" />
          </label>
          <label>
            Model <span className="hint">(optional)</span>
            <input type="text" value={model} onChange={e => setModel(e.target.value)}
              placeholder="claude-sonnet-4-6, deepseek-chat, gpt-4o..." />
          </label>
          <label>
            Working Directory <span className="hint">(optional)</span>
            <input type="text" value={cwd} onChange={e => setCwd(e.target.value)}
              placeholder="/path/to/project" />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading || !userId.trim()}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
