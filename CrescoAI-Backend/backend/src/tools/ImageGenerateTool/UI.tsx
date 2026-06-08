import React from 'react'
import { Box, Text } from '../../ink.js'
import type { ProgressMessage } from '../../types/message.js'
import type { Output } from './ImageGenerateTool.js'

export function renderToolUseMessage(
  input: Partial<{ prompt: string; model: string; size: string }>,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!input.prompt) return null
  if (verbose) {
    const parts = [`prompt: "${input.prompt}"`]
    if (input.model) parts.push(`model: ${input.model}`)
    if (input.size) parts.push(`size: ${input.size}`)
    return parts.join(', ')
  }
  return input.prompt.length > 80
    ? `${input.prompt.slice(0, 80)}…`
    : input.prompt
}

export function renderToolResultMessage(
  output: Output,
  _progress: ProgressMessage[],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (output.error) {
    return (
      <Box>
        <Text color="red">Image generation failed: {output.error}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {output.filePaths.map(fp => (
        <Text key={fp}>
          <Text color="green">Saved</Text> {fp}
        </Text>
      ))}
      {verbose && output.model && (
        <Text dimColor>model: {output.model}</Text>
      )}
    </Box>
  )
}
