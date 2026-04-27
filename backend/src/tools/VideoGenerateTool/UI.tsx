import React from 'react'
import { Box, Text } from '../../ink.js'
import type { ProgressMessage } from '../../types/message.js'
import type { Output } from './VideoGenerateTool.js'

export function renderToolUseMessage(
  input: Partial<{ prompt: string; model: string; resolution: string; duration: number }>,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!input.prompt) return null
  if (verbose) {
    const parts = [`prompt: "${input.prompt}"`]
    if (input.model) parts.push(`model: ${input.model}`)
    if (input.resolution) parts.push(`resolution: ${input.resolution}`)
    if (input.duration) parts.push(`duration: ${input.duration}s`)
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
        <Text color="red">Video generation failed: {output.error}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {output.filePath && (
        <Text>
          <Text color="green">Saved</Text> {output.filePath}
        </Text>
      )}
      {verbose && output.model && (
        <Text dimColor>model: {output.model}</Text>
      )}
    </Box>
  )
}
