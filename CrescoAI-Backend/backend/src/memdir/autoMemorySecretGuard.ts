import { isAutoMemPath, isNativeLoopAutoMemory } from './paths.js'

/** Reject secrets in native-loop auto-memory before a file tool writes them. */
export function checkNativeAutoMemorySecrets(
  filePath: string,
  content: string,
): string | null {
  if (!isNativeLoopAutoMemory() || !isAutoMemPath(filePath)) return null

  // Keep the large scanner off the startup path when native memory is unused.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scanForSecrets } =
    require('../services/teamMemorySync/secretScanner.js') as typeof import('../services/teamMemorySync/secretScanner.js')
  const matches = scanForSecrets(content)
  if (matches.length === 0) return null

  const labels = matches.map(match => match.label).join(', ')
  return (
    `Content contains potential secrets (${labels}) and cannot be written to auto-memory. ` +
    'Remove the sensitive content and try again.'
  )
}

