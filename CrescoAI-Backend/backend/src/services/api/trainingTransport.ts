import { randomUUID } from 'node:crypto';

export interface TrainingTransport {
  runId: string; gatewaySessionId: string; rootConversationId: string;
  baseUrl: string; token: string;
}
export function classifyTrainingCall(source: string | undefined, childId: string | undefined, sessionId: string, transport: TrainingTransport) {
  if (childId) return { agentId: childId, role: 'subagent', purpose: 'skill', parentAgentId: `main:${transport.gatewaySessionId}` };
  if (sessionId === transport.rootConversationId && (source === 'sdk' || source === 'repl_main_thread' || source?.startsWith('repl_main_thread:'))) {
    return { agentId: `main:${transport.gatewaySessionId}`, role: 'main', purpose: 'policy', parentAgentId: '' };
  }
  return { agentId: `aux:${sessionId}`, role: 'auxiliary', purpose: source?.includes('compact') ? 'compaction' : 'other', parentAgentId: `main:${transport.gatewaySessionId}` };
}

/** Must wrap the final wire fetch, AFTER OpenAI compatibility conversion. */
export function createTrainingFetch(
  transport: TrainingTransport, sessionId: string, source: string | undefined,
  childId: () => string | undefined, fetchImpl: typeof fetch = globalThis.fetch,
): typeof fetch {
  const callId = randomUUID(); let attempt = 0;
  return async (input, init) => {
    const identity = classifyTrainingCall(source, childId(), sessionId, transport);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set('authorization', `Bearer ${transport.token}`);
    headers.set('x-training-agent-id', identity.agentId);
    headers.set('x-training-agent-role', identity.role);
    headers.set('x-training-purpose', identity.purpose);
    headers.set('x-training-source', source ?? 'unknown');
    headers.set('x-training-call-id', callId);
    headers.set('x-training-attempt', String(++attempt));
    if (identity.parentAgentId) headers.set('x-training-parent-agent-id', identity.parentAgentId);
    else headers.delete('x-training-parent-agent-id');
    return fetchImpl(input, { ...init, headers });
  };
}

/** SDK root messages only. Subagent progress and nested tool results are excluded. */
export async function reportTrainingToolResults(transport: TrainingTransport | undefined, message: unknown, fetchImpl: typeof fetch = globalThis.fetch) {
  if (!transport || !message || typeof message !== 'object') return;
  const msg = message as Record<string, any>;
  if (msg.type !== 'user' || msg.parent_tool_use_id !== null || !Array.isArray(msg.message?.content)) return;
  for (const block of msg.message.content) {
    if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
    const response = await fetchImpl(`${transport.baseUrl}/events`, {
      method: 'POST', headers: { authorization: `Bearer ${transport.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: `main:${transport.gatewaySessionId}`, toolUseId: block.tool_use_id, content: block.content ?? '', isError: block.is_error === true }),
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Training tool-result capture failed');
    await response.arrayBuffer();
  }
}
