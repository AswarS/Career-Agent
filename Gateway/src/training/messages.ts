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
  const tools: any[] = [];
  const toolDefinitions = new Map<string, string>();
  for (const call of projection.calls) {
    let definitions = call.request.tools ?? [];
    if (typeof definitions === 'string') {
      try { definitions = JSON.parse(definitions); } catch { issues.push('invalid_request_tools'); continue; }
    }
    if (!Array.isArray(definitions)) { issues.push('invalid_request_tools'); continue; }
    for (const definition of definitions) {
      const name = definition?.function?.name ?? definition?.name;
      const key = typeof name === 'string' && name ? `name:${name}` : `anonymous:${canonical(definition)}`;
      const encoded = canonical(definition);
      const previous = toolDefinitions.get(key);
      if (previous && previous !== encoded) {
        issues.push(`tool_schema_changed:${typeof name === 'string' ? name : 'anonymous'}`);
        continue;
      }
      if (!previous) {
        toolDefinitions.set(key, encoded);
        tools.push(structuredClone(definition));
      }
    }
  }
  const invalid = issues.some(issue => ['context_rewritten_use_per_call_messages', 'system_context_changed', 'assistant_history_mismatch', 'unsupported_request_messages', 'duplicate_request_id', 'invalid_request_tools'].includes(issue) || issue.startsWith('tool_schema_changed:'));
  return { format: 'gateway.messages_list.v1', messages_list: invalid ? null : messages,
    tools, callCount: projection.callCount, issues };
}

function jsonText(value: unknown): string {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return value;
    } catch {}
    return JSON.stringify(value);
  }
  return JSON.stringify(value ?? null);
}

function textContent(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (!Array.isArray(value)) return JSON.stringify(value);
  const text = value.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('');
  return value.every(block => block?.type === 'text') ? text : null;
}

function isToolLoadNotice(content: string): boolean {
  return /^(?:Tool loaded\.\s*)+$/.test(content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim());
}

/** Directly consumable by ms-swift with Qwen3.5's qwen3_5 agent template. */
export function qwen35SftExport(events: JournalEvent[]) {
  const projection = messagesListExport(events);
  const issues = [...projection.issues];
  const messages: Array<{ role: string; content: string }> = [];
  const appendAssistant = (content: string, reasoning?: string) => {
    const think = reasoning?.trim() ? `<think>\n${reasoning.trim()}\n</think>\n\n` : '';
    if (think || content) messages.push({ role: 'assistant', content: think + content });
  };
  if (projection.messages_list) for (const message of projection.messages_list) {
    if (!message || typeof message !== 'object') { issues.push('qwen3_5_invalid_message'); continue; }
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const reasoning = message.content.filter((block: any) => block?.type === 'thinking').map((block: any) => block.thinking ?? '').join('');
      const content = message.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text ?? '').join('');
      appendAssistant(content, reasoning);
      for (const block of message.content.filter((item: any) => item?.type === 'tool_use')) {
        messages.push({ role: 'tool_call', content: JSON.stringify({ name: block.name, arguments: block.input ?? {} }) });
      }
      if (message.content.some((block: any) => !['thinking', 'text', 'tool_use'].includes(block?.type))) issues.push('qwen3_5_unsupported_assistant_block');
      continue;
    }
    if (message.role === 'assistant') {
      const content = textContent(message.content);
      if (content === null) issues.push('qwen3_5_unsupported_assistant_content');
      else appendAssistant(content, typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined);
      for (const call of message.tool_calls ?? []) {
        let args: unknown = call?.function?.arguments ?? {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { issues.push('qwen3_5_invalid_tool_arguments'); continue; }
        }
        if (!call?.function?.name || !args || typeof args !== 'object' || Array.isArray(args)) { issues.push('qwen3_5_invalid_tool_call'); continue; }
        messages.push({ role: 'tool_call', content: JSON.stringify({ name: call.function.name, arguments: args }) });
      }
      continue;
    }
    if (message.role === 'tool') {
      messages.push({ role: 'tool_response', content: jsonText(message.content) });
      continue;
    }
    if (message.role === 'user' && Array.isArray(message.content)) {
      const plain: string[] = [];
      for (const block of message.content) {
        if (block?.type === 'text' && typeof block.text === 'string') plain.push(block.text);
        else if (block?.type === 'tool_result') messages.push({ role: 'tool_response', content: jsonText(block.content) });
        else issues.push('qwen3_5_unsupported_user_block');
      }
      const content = plain.join('');
      if (content && !isToolLoadNotice(content)) messages.push({ role: 'user', content });
      continue;
    }
    if (message.role === 'system' || message.role === 'user') {
      const content = textContent(message.content);
      if (content === null) issues.push('qwen3_5_unsupported_message_content');
      else if (!(message.role === 'user' && isToolLoadNotice(content))) messages.push({ role: message.role, content });
      continue;
    }
    issues.push(`qwen3_5_unsupported_role:${String(message.role)}`);
  }
  if (!projection.messages_list) issues.push('qwen3_5_source_conversation_unavailable');
  if (!messages.length) issues.push('qwen3_5_empty_conversation');
  const finalMessage = messages.at(-1);
  const finalAnswer = finalMessage?.role === 'assistant'
    ? finalMessage.content.replace(/^<think>[\s\S]*?<\/think>\s*/, '').trim() : '';
  if (!finalAnswer) issues.push('qwen3_5_missing_final_assistant');
  const toolCalls = messages.filter(message => message.role === 'tool_call').length;
  const toolResponses = messages.filter(message => message.role === 'tool_response').length;
  if (toolCalls !== toolResponses) issues.push('qwen3_5_unbalanced_tool_roundtrip');
  let tools: string | null = null;
  try {
    const value = typeof projection.tools === 'string' ? JSON.parse(projection.tools) : projection.tools;
    if (!Array.isArray(value)) throw new Error('invalid tools');
    tools = JSON.stringify(value);
    const definedNames = new Set(value.map((tool: any) => tool?.function?.name ?? tool?.name).filter((name: unknown) => typeof name === 'string'));
    const calledNames = messages
      .filter(message => message.role === 'tool_call')
      .map(message => { try { return JSON.parse(message.content)?.name; } catch { return null; } })
      .filter((name): name is string => typeof name === 'string');
    for (const name of new Set(calledNames)) {
      if (!definedNames.has(name)) issues.push(`qwen3_5_missing_tool_schema:${name}`);
    }
  } catch { issues.push('qwen3_5_invalid_tools'); }
  const uniqueIssues = [...new Set(issues)];
  return {
    format: 'ms-swift.qwen3_5.sft.v1', agent_template: 'qwen3_5',
    sftReady: uniqueIssues.length === 0, messages: uniqueIssues.length ? null : messages,
    tools, callCount: projection.callCount, issues: uniqueIssues,
  };
}
