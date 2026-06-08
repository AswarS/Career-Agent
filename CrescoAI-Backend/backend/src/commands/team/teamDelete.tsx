import * as React from 'react'
import { Box, Text } from 'ink'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  cleanupTeamDirectories,
  readTeamFile,
  unregisterTeamForSessionCleanup,
} from '../../utils/swarm/teamHelpers.js'
import { clearTeammateColors } from '../../utils/swarm/teammateLayoutManager.js'
import { clearLeaderTeamName } from '../../utils/tasks.js'

export function TeamDeleteView({
  context,
  onDone,
  teamName,
}: {
  context: LocalJSXCommandContext
  teamName: string
  onDone: LocalJSXCommandOnDone
}) {
  const [status, setStatus] = React.useState<'deleting' | 'done' | 'error'>('deleting')
  const [errorMsg, setErrorMsg] = React.useState('')
  const [deletedName, setDeletedName] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    async function deleteTeam() {
      try {
        const appState = context.getAppState()
        const targetName = teamName.trim() || appState.teamContext?.teamName

        if (!targetName) {
          if (!cancelled) {
            setErrorMsg('No team specified and not currently in a team.')
            setStatus('error')
          }
          return
        }

        const teamFile = readTeamFile(targetName)
        if (!teamFile) {
          if (!cancelled) {
            setErrorMsg(`Team "${targetName}" not found.`)
            setStatus('error')
          }
          return
        }

        await cleanupTeamDirectories(targetName)
        unregisterTeamForSessionCleanup(targetName)
        clearTeammateColors()
        clearLeaderTeamName()

        // Clear teamContext from AppState if deleting current team
        if (appState.teamContext?.teamName === targetName) {
          context.setAppState(prev => ({
            ...prev,
            teamContext: undefined,
          }))
        }

        if (!cancelled) {
          setDeletedName(targetName)
          setStatus('done')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    }

    deleteTeam()
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    if (status === 'done' || status === 'error') {
      const msg =
        status === 'done'
          ? `Team "${deletedName}" deleted.`
          : errorMsg
      onDone(msg, { display: 'system', shouldQuery: false })
    }
  }, [status])

  if (status === 'deleting') {
    return (
      <Box paddingX={1}>
        <Text color="yellow">Deleting team...</Text>
      </Box>
    )
  }

  if (status === 'error') {
    return (
      <Box paddingX={1}>
        <Text color="red">Error: {errorMsg}</Text>
      </Box>
    )
  }

  return (
    <Box paddingX={1}>
      <Text color="green">Team "{deletedName}" deleted successfully.</Text>
    </Box>
  )
}
