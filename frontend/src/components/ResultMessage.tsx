import type { ChatMessage } from '../types'

export default function ResultMessage({ message }: { message: ChatMessage }) {
  const r = message.result
  if (!r) return null
  return (
    <div className="message result-message">
      <div className="result-text">{r.result}</div>
      <div className="result-stats">
        <span>{(r.duration_ms / 1000).toFixed(1)}s</span>
        <span>{r.num_turns} turn{r.num_turns !== 1 ? 's' : ''}</span>
        {r.total_cost_usd > 0 && <span>${r.total_cost_usd.toFixed(4)}</span>}
        {r.usage && (
          <span>{r.usage.input_tokens + r.usage.output_tokens} tokens</span>
        )}
      </div>
    </div>
  )
}
