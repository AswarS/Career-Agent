import type { ToolUseBlock as ToolUseBlockType } from '../../types'

export default function ToolUseBlock({ block }: { block: ToolUseBlockType }) {
  const isBash = block.name === 'Bash'
  const inputStr = JSON.stringify(block.input, null, 2)
  const cmd = isBash ? String(block.input.command ?? '') : ''
  return (
    <div className="block-tool-use">
      <div className="tool-header">
        <span className="tool-badge" data-tool={block.name.toLowerCase()}>{block.name}</span>
        {isBash && cmd && (
          <code className="tool-command">{cmd}</code>
        )}
      </div>
      {!isBash && (
        <pre className="tool-input"><code>{inputStr}</code></pre>
      )}
    </div>
  )
}
