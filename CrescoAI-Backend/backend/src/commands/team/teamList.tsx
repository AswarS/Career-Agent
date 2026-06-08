import * as React from 'react'
import { Box, Text } from 'ink'
import { readdirSync } from 'fs'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { getTeamsDir, readTeamFile, type TeamFile } from '../../utils/swarm/teamHelpers.js'

function getAllTeams(): Array<TeamFile & { dirName: string }> {
  const teamsDir = getTeamsDir()
  let entries: string[]
  try {
    entries = readdirSync(teamsDir)
  } catch {
    return []
  }

  const teams: Array<TeamFile & { dirName: string }> = []
  for (const entry of entries) {
    const teamFile = readTeamFile(entry)
    if (teamFile) {
      teams.push({ ...teamFile, dirName: entry })
    }
  }
  return teams
}

export function TeamListView({
  context,
  onDone,
}: {
  context: LocalJSXCommandContext
  onDone: LocalJSXCommandOnDone
}) {
  const teams = getAllTeams()
  const currentTeam = context.getAppState().teamContext?.teamName

  React.useEffect(() => {
    onDone(undefined, { display: 'skip', shouldQuery: false })
  }, [])

  if (teams.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No teams found. Use /team create to create one.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Teams</Text>
      {teams.map(team => {
        const isCurrent = team.name === currentTeam
        const memberCount = team.members.length
        const age = Date.now() - team.createdAt
        const ageStr =
          age < 60_000
            ? `${Math.floor(age / 1000)}s ago`
            : age < 3_600_000
              ? `${Math.floor(age / 60_000)}m ago`
              : `${Math.floor(age / 3_600_000)}h ago`

        return (
          <Box key={team.dirName} marginTop={1} flexDirection="column">
            <Box>
              <Text color="cyan">{team.name}</Text>
              {isCurrent && <Text color="green"> (current)</Text>}
              <Text dimColor> - {memberCount} member{memberCount !== 1 ? 's' : ''} - {ageStr}</Text>
            </Box>
            <Box flexDirection="column" marginLeft={2}>
              {team.members.map(m => (
                <Box key={m.agentId}>
                  <Text dimColor>
                    {m.name}
                    {m.agentType ? ` (${m.agentType})` : ''}
                    {m.model ? ` [${m.model}]` : ''}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export function TeamStatusView({
  context,
  onDone,
}: {
  context: LocalJSXCommandContext
  onDone: LocalJSXCommandOnDone
}) {
  const appState = context.getAppState()
  const teamContext = appState.teamContext

  React.useEffect(() => {
    onDone(undefined, { display: 'skip', shouldQuery: false })
  }, [])

  if (!teamContext) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Not currently in a team. Use /team create to start one.</Text>
      </Box>
    )
  }

  const teamFile = readTeamFile(teamContext.teamName)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Team Status</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text bold>Name: </Text>
          <Text color="cyan">{teamContext.teamName}</Text>
        </Text>
        <Text>
          <Text bold>Lead: </Text>
          {teamContext.leadAgentId}
        </Text>
        {teamFile && (
          <Text>
            <Text bold>Created: </Text>
            {new Date(teamFile.createdAt).toLocaleString()}
          </Text>
        )}
        <Text>
          <Text bold>Members: </Text>
          {Object.keys(teamContext.teammates).length}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {Object.entries(teamContext.teammates).map(([id, t]) => (
          <Box key={id} flexDirection="column">
            <Text>
              <Text color={t.color || 'white'}>{t.name}</Text>
              {t.agentType && <Text dimColor> ({t.agentType})</Text>}
            </Text>
            <Text dimColor>  cwd: {t.cwd}</Text>
          </Box>
        ))}
      </Box>
      {teamFile && (
        <Box marginTop={1}>
          <Text dimColor>Config: {teamContext.teamFilePath}</Text>
        </Box>
      )}
    </Box>
  )
}
