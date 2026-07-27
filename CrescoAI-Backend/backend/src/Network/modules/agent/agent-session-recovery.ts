import { stat } from 'node:fs/promises';
import type { Message } from '../../../types/message.js';
import { loadMessagesFromJsonlPath } from '../../../utils/conversationRecovery.js';
import { ensureNetworkTranscriptFile } from '../../utils/networkTranscriptStorage.js';

export interface RestoredAgentSession {
  messages: Message[];
  tailUuid: string | null;
}

export async function loadAgentSessionHistory(
  userId: string,
  conversationId: string,
): Promise<RestoredAgentSession> {
  const transcriptPath = await ensureNetworkTranscriptFile(userId, conversationId);
  return loadAgentSessionHistoryFromPath(transcriptPath);
}

export async function loadAgentSessionHistoryFromPath(
  transcriptPath: string,
): Promise<RestoredAgentSession> {
  const transcriptStat = await stat(transcriptPath);
  if (transcriptStat.size === 0) {
    return { messages: [], tailUuid: null };
  }

  const restored = await loadMessagesFromJsonlPath(transcriptPath);
  if (restored.messages.length === 0) {
    throw new Error(`Existing transcript could not be restored: ${transcriptPath}`);
  }

  const tail = restored.messages.findLast((message) => message.type !== 'progress');
  return {
    messages: restored.messages as Message[],
    tailUuid: typeof tail?.uuid === 'string' ? tail.uuid : null,
  };
}
