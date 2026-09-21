import { decodeResponse } from '../proxy/response.ts';
import type { JournalEvent } from './export.ts';

/** Per-call snapshots avoid duplicating history into an invented conversation. */
export function messageExport(events: JournalEvent[]) {
  const requests = events.filter(e => e.payload.type === 'model.request' && e.payload.identity?.agentRole === 'main' && e.payload.identity?.purpose === 'policy');
  const issues: string[] = [];
  if (new Set(requests.map(e => e.payload.identity.requestId)).size !== requests.length) issues.push('duplicate_request_id');
  const calls = requests.map(request => {
    const p = request.payload;
    const replies = events.filter(e => e.payload.type === 'model.response' && e.payload.identity?.requestId === p.identity.requestId);
    const reply = replies.length === 1 ? replies[0] : undefined;
    let decoded = reply?.payload.response;
    if (!decoded?.message && reply?.payload.rawBody) {
      try {
        const raw = reply.payload.rawBody;
        decoded = decodeResponse(p.protocol, raw, /^data:|\ndata:|^event:/m.test(raw));
      } catch { issues.push(`${p.identity.requestId}:response_decode_failed`); }
    }
    const complete = replies.length === 1 && reply!.sequence > request.sequence
      && reply!.payload.protocol === p.protocol && reply!.payload.complete === true
      && reply!.payload.status >= 200 && reply!.payload.status < 300 && decoded?.complete !== false && Boolean(decoded?.message);
    if (!complete) issues.push(`${p.identity.requestId}:incomplete_response`);
    const toolCalls = events.filter(e => e.payload.type === 'tool.call' && e.payload.requestId === p.identity.requestId);
    return {
      requestId: p.identity.requestId, identity: p.identity, protocol: p.protocol,
      requestSequence: request.sequence, responseSequence: reply?.sequence ?? null,
      request: p.body, assistant: decoded?.message ?? null, usage: decoded?.usage ?? null,
      status: reply?.payload.status ?? null, complete,
      tools: toolCalls.map(call => {
        const results = events.filter(e => e.payload.type === 'tool.result' && e.payload.toolUseId === call.payload.toolUseId && e.payload.agentId === call.payload.agentId);
        if (results.length !== 1) issues.push(`${call.payload.toolUseId}:missing_or_duplicate_tool_result`);
        return { call: call.payload, results: results.map(e => e.payload) };
      }),
    };
  });
  return { format: 'gateway.messages.v1', callCount: calls.length, issues, calls };
}

/** A single chronological conversation; refuse to disguise rewritten contexts as append-only history. */
export function messagesListExport(events: JournalEvent[]) {
  const projection = messageExport(events);
  const issues = [...projection.issues];
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  let previous: any[] = [];
  let messages: any[] = [];
  let system: unknown;
  const outputs: Array<{ index: number; message: any }> = [];
  for (const call of projection.calls) {
    const input = call.request.messages;
    if (!Array.isArray(input)) { issues.push('unsupported_request_messages'); continue; }
    if (previous.length > input.length || previous.some((message, i) => canonical(message) !== canonical(input[i]))) {
      issues.push('context_rewritten_use_per_call_messages');
    }
    if (previous.length && canonical(system) !== canonical(call.request.system)) issues.push('system_context_changed');
    system = call.request.system;
    messages = structuredClone(input);
    previous = input;
    if (call.complete) outputs.push({ index: input.length, message: structuredClone(call.assistant) });
  }
  // Use actual request history for observations, and captured outputs for reasoning/signatures
  // that the backend may have omitted from subsequent input messages.
  for (const output of outputs) {
    if (output.index < messages.length && messages[output.index]?.role !== 'assistant') issues.push('assistant_history_mismatch');
    else messages[output.index] = output.message;
  }
  const last = projection.calls.at(-1);
  if (last?.complete) {
    for (const tool of last.tools) for (const result of tool.results) {
      if (last.protocol === 'openai') messages.push({ role: 'tool', tool_call_id: result.toolUseId,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content) });
      else messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: result.toolUseId, content: result.content, is_error: result.isError }] });
    }
  }
  if (system !== undefined) messages.unshift({ role: 'system', content: structuredClone(system) });
  const invalid = issues.some(issue => ['context_rewritten_use_per_call_messages', 'system_context_changed', 'assistant_history_mismatch', 'unsupported_request_messages', 'duplicate_request_id'].includes(issue));
  return { format: 'gateway.messages_list.v1', messages_list: invalid ? null : messages,
    tools: projection.calls[0]?.request.tools ?? [], callCount: projection.callCount, issues };
}
