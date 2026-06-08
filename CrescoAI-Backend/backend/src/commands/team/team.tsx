import * as React from 'react'
import { Box, Text } from 'ink'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

const SUBCOMMANDS = new Set(['create', 'delete', 'list', 'status'])

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const parts = args.trim().split(/\s+/)
  const subcommand = parts[0]

  // Recognized subcommand → route to handler
  if (subcommand && SUBCOMMANDS.has(subcommand)) {
    const rest = parts.slice(1).join(' ')
    switch (subcommand) {
      case 'create': {
        const { TeamCreateView } = await import('./teamCreate.js')
        // /team create <name> [task description...]
        // First word after "create" is the team name, rest is the task
        const createParts = parts.slice(1)
        const name = createParts[0] || ''
        const desc = createParts.slice(1).join(' ')
        return <TeamCreateView context={context} onDone={onDone} teamName={name} taskDescription={desc || undefined} />
      }
      case 'delete': {
        const { TeamDeleteView } = await import('./teamDelete.js')
        return <TeamDeleteView context={context} onDone={onDone} teamName={rest} />
      }
      case 'list': {
        const { TeamListView } = await import('./teamList.js')
        return <TeamListView context={context} onDone={onDone} />
      }
      case 'status': {
        const { TeamStatusView } = await import('./teamList.js')
        return <TeamStatusView context={context} onDone={onDone} />
      }
    }
  }

  // No subcommand or unknown text → treat as task description for quick dispatch.
  // Creates a team (if not already in one) then hands off to the LLM to orchestrate.
  if (args.trim()) {
    const { TeamCreateView } = await import('./teamCreate.js')
    return (
      <TeamCreateView
        context={context}
        onDone={onDone}
        teamName=""       // auto-generate name
        taskDescription={args.trim()}
      />
    )
  }

  // Bare /team → help
  return <TeamHelpView onDone={onDone} context={context} />
}

function TeamHelpView({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
}) {
  const appState = context.getAppState()
  const currentTeam = appState.teamContext?.teamName

  React.useEffect(() => {
    onDone(undefined, { display: 'skip', shouldQuery: false })
  }, [])

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Team Commands</Text>
      {currentTeam && (
        <Box marginTop={1}>
          <Text color="green">Current team: </Text>
          <Text bold>{currentTeam}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="cyan">/team &lt;task&gt;</Text> - Create team and dispatch agents for the task
        </Text>
        <Text>
          <Text color="cyan">/team create &lt;name&gt; [desc]</Text> - Create a team (optionally with task)
        </Text>
        <Text>
          <Text color="cyan">/team delete [name]</Text> - Delete a team (defaults to current)
        </Text>
        <Text>
          <Text color="cyan">/team list</Text> - List all teams
        </Text>
        <Text>
          <Text color="cyan">/team status</Text> - Show current team details
        </Text>
      </Box>
    </Box>
  )
}
