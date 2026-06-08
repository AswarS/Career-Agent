import * as React from 'react'
import { Box, Text } from 'ink'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { generateWordSlug } from '../../utils/words.js'
import {
  type TeamFile,
  getTeamFilePath,
  readTeamFile,
  registerTeamForSessionCleanup,
  sanitizeName,
  writeTeamFileAsync,
} from '../../utils/swarm/teamHelpers.js'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'
import { formatAgentId } from '../../utils/agentId.js'
import { getSessionId } from '../../bootstrap/state.js'
import {
  getDefaultMainLoopModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import { getCwd } from '../../utils/cwd.js'
import { ensureTasksDir, resetTaskList, setLeaderTeamName } from '../../utils/tasks.js'

export function TeamCreateView({
  context,
  onDone,
  teamName,
  taskDescription,
}: {
  context: LocalJSXCommandContext
  onDone: LocalJSXCommandOnDone
  teamName: string
  /** If provided, team creation hands off to the LLM with this task description */
  taskDescription?: string
}) {
  const [status, setStatus] = React.useState<'creating' | 'done' | 'error'>('creating')
  const [errorMsg, setErrorMsg] = React.useState('')
  const [result, setResult] = React.useState<{ name: string; path: string } | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function createTeam() {
      try {
        const appState = context.getAppState()

        // Check if already in a team
        const existingTeam = appState.teamContext?.teamName
        if (existingTeam) {
          if (!cancelled) {
            setErrorMsg(`Already in team "${existingTeam}". Use /team delete first.`)
            setStatus('error')
          }
          return
        }

        // Resolve team name: first arg is name, rest is description
        let finalName = teamName.trim()
        if (!finalName) {
          finalName = generateWordSlug()
        }

        // Ensure uniqueness
        if (readTeamFile(finalName)) {
          finalName = generateWordSlug()
        }

        const leadAgentId = formatAgentId(TEAM_LEAD_NAME, finalName)
        const leadModel = parseUserSpecifiedModel(
          appState.mainLoopModelForSession ??
            appState.mainLoopModel ??
            getDefaultMainLoopModel(),
        )

        const teamFilePath = getTeamFilePath(finalName)

        const teamFile: TeamFile = {
          name: finalName,
          createdAt: Date.now(),
          leadAgentId,
          leadSessionId: getSessionId(),
          members: [
            {
              agentId: leadAgentId,
              name: TEAM_LEAD_NAME,
              model: leadModel,
              joinedAt: Date.now(),
              tmuxPaneId: '',
              cwd: getCwd(),
              subscriptions: [],
            },
          ],
        }

        await writeTeamFileAsync(finalName, teamFile)
        registerTeamForSessionCleanup(finalName)

        const taskListId = sanitizeName(finalName)
        await resetTaskList(taskListId)
        await ensureTasksDir(taskListId)
        setLeaderTeamName(taskListId)

        // Update AppState
        context.setAppState(prev => ({
          ...prev,
          teamContext: {
            teamName: finalName,
            teamFilePath,
            leadAgentId,
            teammates: {
              [leadAgentId]: {
                name: TEAM_LEAD_NAME,
                tmuxSessionName: '',
                tmuxPaneId: '',
                cwd: getCwd(),
                spawnedAt: Date.now(),
              },
            },
          },
        }))

        if (!cancelled) {
          setResult({ name: finalName, path: teamFilePath })
          setStatus('done')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    }

    createTeam()
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    if (status === 'done' && result) {
      if (taskDescription) {
        // Build agent catalog from available definitions
        const agentDefs = context.options.agentDefinitions?.activeAgents ?? []
        const agentCatalog = agentDefs
          .filter(a => a.agentType !== 'general-purpose')
          .map(a => `- ${a.agentType}: ${a.whenToUse}`)
          .join('\n')

        // Hand off to the LLM: it will see the team creation result and
        // the user's task, then autonomously spawn teammates and coordinate.
        // Provide a concrete Agent tool call example so the LLM knows to
        // combine subagent_type with name + team_name when spawning.
        onDone(
          `Team "${result.name}" created. Now coordinating agents for the task.`,
          {
            display: 'system',
            shouldQuery: true,
            nextInput:
              `Team "${result.name}" is ready. Task: ${taskDescription}\n\n` +
              `## Step 1: Break this task into parallel subtasks\n` +
              `## Step 2: Spawn one teammate per subtask using the Agent tool\n\n` +
              `IMPORTANT: You MUST include subagent_type in every Agent call to select a specialized agent. Example:\n` +
              '```json\n' +
              `{"description": "build frontend", "name": "frontend-dev", "subagent_type": "前端开发者", "team_name": "${result.name}", "mode": "bypassPermissions", "prompt": "...detailed task description..."}` +
              '\n```\n\n' +
              (agentCatalog
                ? `Available agents (use the exact name as subagent_type):\n${agentCatalog}\n\n`
                : '') +
              `Spawn all teammates in parallel using multiple Agent tool calls in one message. ` +
              `Assign each subtask to the best-matching agent type. ` +
              `When a subtask matches an available skill (e.g. /commit), use the Skill tool.`,
            submitNextInput: true,
          },
        )
      } else {
        onDone(
          `Team "${result.name}" created. Config: ${result.path}`,
          { display: 'system', shouldQuery: false },
        )
      }
    }

    if (status === 'error') {
      onDone(errorMsg, { display: 'system', shouldQuery: false })
    }
  }, [status])

  if (status === 'creating') {
    return (
      <Box paddingX={1}>
        <Text color="yellow">Creating team...</Text>
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
    <Box flexDirection="column" paddingX={1}>
      <Text color="green">Team "{result!.name}" created</Text>
      {taskDescription ? (
        <Text color="cyan">Dispatching agents for: {taskDescription}</Text>
      ) : (
        <>
          <Text dimColor>Config: {result!.path}</Text>
          <Text dimColor>Use the Agent tool to spawn teammates and coordinate work.</Text>
        </>
      )}
    </Box>
  )
}
