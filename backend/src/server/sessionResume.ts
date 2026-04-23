/**
 * sessionResume.ts — Resume a previous conversation from a JSONL transcript
 *
 * Loads conversation history from a session's transcript file and creates
 * a new QueryEngine pre-loaded with the restored messages.
 *
 * Uses the existing sessionStorage utilities (loadTranscriptFromFile,
 * getSessionFilesWithMtime) which handle JSONL parsing, conversation chain
 * reconstruction, compaction boundaries, and parallel tool result recovery.
 */

import type { SessionContext } from './SessionContext.js'
import { createQueryEngineForSession } from './queryEngineFactory.js'
import { runWithSessionContext } from './SessionContext.js'
import {
  getTranscriptPathForSession,
  loadTranscriptFromFile,
  getSessionFilesWithMtime,
} from '../utils/sessionStorage.js'
import { getProjectDir } from '../utils/sessionStoragePortable.js'
import type { UUID } from 'crypto'

export type ResumeResult =
  | { success: true; sessionId: string; messageCount: number }
  | { success: false; error: string }

/**
 * Attempt to load a previous session's conversation history from its JSONL file.
 * Must be called inside the new session's ALS context so getTranscriptPathForSession
 * routes correctly.
 *
 * Returns the serialized messages array from the conversation chain, or null
 * if the session file doesn't exist or contains no usable messages.
 */
export async function loadSessionHistory(
  previousSessionId: string,
  context: SessionContext,
): Promise<import('../types/logs.js').SerializedMessage[] | null> {
  try {
    const transcriptPath = runWithSessionContext(context, () =>
      getTranscriptPathForSession(previousSessionId),
    )

    // loadTranscriptFromFile handles JSONL parsing, chain building, and
    // compaction boundary recovery. It returns a LogOption with .messages
    // as a SerializedMessage[] ready for QueryEngine consumption.
    const logOption = await loadTranscriptFromFile(transcriptPath)

    if (!logOption || !logOption.messages || logOption.messages.length === 0) {
      return null
    }

    return logOption.messages
  } catch (err: any) {
    console.warn(
      `[sessionResume] Failed to load history for session ${previousSessionId}:`,
      err.message,
    )
    return null
  }
}

/**
 * Create a new QueryEngine pre-loaded with a previous session's conversation history.
 * This is async because transcript loading involves file I/O.
 */
export async function createResumedQueryEngine(
  context: SessionContext,
  previousSessionId: string,
): Promise<ResumeResult> {
  const history = await loadSessionHistory(previousSessionId, context)

  if (!history) {
    return {
      success: false,
      error: `No conversation history found for session ${previousSessionId}`,
    }
  }

  try {
    context.queryEngine = createQueryEngineForSession(context, {
      initialMessages: history,
    })
    return {
      success: true,
      sessionId: context.sessionId,
      messageCount: history.length,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to create resumed QueryEngine: ${err.message}`,
    }
  }
}

export type SessionHistoryEntry = {
  sessionId: string
  path: string
  mtime: number
  ctime: number
  size: number
}

/**
 * List all past session files for a given project directory.
 * Uses the same project directory resolution as the original CLI.
 */
export async function listSessionHistory(
  projectDir: string,
): Promise<SessionHistoryEntry[]> {
  const files = await getSessionFilesWithMtime(projectDir)
  const entries: SessionHistoryEntry[] = []

  for (const [sessionId, info] of files) {
    entries.push({
      sessionId,
      path: info.path,
      mtime: info.mtime,
      ctime: info.ctime,
      size: info.size,
    })
  }

  // Sort by modification time, newest first
  entries.sort((a, b) => b.mtime - a.mtime)
  return entries
}
