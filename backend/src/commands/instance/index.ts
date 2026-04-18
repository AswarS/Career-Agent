/**
 * /instance command — Manage multi-user instances in terminal mode
 *
 * Subcommands: new, list, switch, close, resume, info
 */
import type { Command } from '../../commands.js'

const instance = {
  type: 'local',
  name: 'instance',
  description: 'Manage multi-user instances (new/list/switch/close/resume/info)',
  aliases: ['instances', 'inst'],
  supportsNonInteractive: false,
  argumentHint: '<subcommand>',
  load: () => import('./instance.js'),
} satisfies Command

export default instance
