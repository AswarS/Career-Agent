/**
 * REPLTool shim.
 * The original REPL implementation was not recoverable from source maps.
 * This stub satisfies the require() in tools.ts and disables itself via isEnabled().
 */

import type { Tool } from '../../Tool.js'

export const REPLTool: Tool<never, never> = {
  name: 'REPL',
  isEnabled: () => false,
  async description() {
    return 'REPL tool (not available in restored build)'
  },
} as unknown as Tool<never, never>
