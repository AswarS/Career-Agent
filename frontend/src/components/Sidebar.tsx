import { useState, useMemo } from 'react'
import { useApp } from '../hooks/useApp'
import NewSessionDialog from './NewSessionDialog'

export default function Sidebar() {
  const { state, deleteSession, refreshSessions, setActiveSession } = useApp()
  const [showNew, setShowNew] = useState(false)

  const sessions = useMemo(
    () => Array.from(state.sessions.values()).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt
    ),
    [state.sessions]
  )

  // Group sessions by userId
  const groups = useMemo(() => {
    const map = new Map<string, typeof sessions>()
    for (const s of sessions) {
      const key = s.userId || 'default'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [sessions])

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Sessions</h2>
        <div className="sidebar-actions">
          <button className="btn-icon" onClick={refreshSessions} title="Refresh">&#8635;</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New</button>
        </div>
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div className="empty-state">No sessions yet.<br />Click "+ New" to create one.</div>
        )}
        {Array.from(groups.entries()).map(([userId, groupSessions]) => (
          <div key={userId} className="session-group">
            {groups.size > 1 && (
              <div className="session-group-header">{userId === 'default' ? 'Default' : userId} ({groupSessions.length})</div>
            )}
            {groupSessions.map(s => (
              <div
                key={s.id}
                className={`session-item ${s.id === state.activeSessionId ? 'active' : ''}`}
                onClick={() => setActiveSession(s.id)}
              >
                <div className="session-item-title">{s.cwd.split(/[\\/]/).pop() || s.cwd}</div>
                <div className="session-item-meta">
                  <span className={`state-dot ${s.state}`} />
                  <span className="session-time">{new Date(s.lastActivityAt).toLocaleTimeString()}</span>
                </div>
                <button
                  className="btn-delete"
                  onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                  title="Delete session"
                >&times;</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {showNew && <NewSessionDialog onClose={() => setShowNew(false)} />}
    </div>
  )
}
