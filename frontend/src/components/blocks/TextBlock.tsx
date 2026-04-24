import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TextBlock as TextBlockType } from '../../types'

export default function TextBlock({ block }: { block: TextBlockType }) {
  return (
    <div className="block-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {block.text}
      </ReactMarkdown>
    </div>
  )
}
