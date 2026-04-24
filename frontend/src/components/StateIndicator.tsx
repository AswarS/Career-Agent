import type { SessionState } from '../types'

export default function StateIndicator({ state }: { state: SessionState }) {
  const label = state === 'running' ? 'Running...' : state === 'requires_action' ? 'Action Required' : 'Idle'
  return (
    <span className={`state-indicator ${state}`}>
      <span className="state-dot-indicator" />
      {label}
    </span>
  )
}
