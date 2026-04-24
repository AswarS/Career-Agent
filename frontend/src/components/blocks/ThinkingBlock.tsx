import { useState } from 'react'
import type { ThinkingBlock as ThinkingBlockType } from '../../types'

export default function ThinkingBlock({ block }: { block: ThinkingBlockType }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="block-thinking" open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Thinking...</summary>
      <pre>{block.thinking}</pre>
    </details>
  )
}
