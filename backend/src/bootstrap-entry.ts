import { ensureBootstrapMacro } from './bootstrapMacro'

ensureBootstrapMacro()
console.log("hello")

await import('./entrypoints/cli.tsx')
