import type { Command } from '../../commands.js'

const team: Command = {
  type: 'local-jsx',
  name: 'team',
  aliases: ['teams'],
  description: 'Manage multi-agent teams — create a team and dispatch agents to work on tasks',
  argumentHint: '[create|delete|list|status] [args]',
  load: () => import('./team.js'),
} satisfies Command

export default team
