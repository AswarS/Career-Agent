export type Protocol = 'openai' | 'anthropic';
type Obj = Record<string, any>;

/** Preserve raw response separately; this projection assembles stream deltas for inspection. */
export function decodeResponse(protocol: Protocol, raw: string, stream: boolean) {
  if (!stream) {
    const body = JSON.parse(raw) as Obj;
    const message = protocol === 'openai' ? body.choices?.[0]?.message : body;
    return { complete: !body.error && Boolean(message), message, usage: body.usage ?? null, events: [] as Obj[] };
  }
  const events: Obj[] = [];
  let done = false;
  for (const frame of raw.replace(/\r\n/g, '\n').split('\n\n')) {
    const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data) continue;
    if (data === '[DONE]') { if (protocol === 'openai') done = true; continue; }
    events.push(JSON.parse(data));
  }
  let usage: Obj = {};
  if (protocol === 'openai') {
    const message: Obj = { role: 'assistant', content: '', tool_calls: [] };
    const tools = new Map<number, Obj>();
    for (const event of events) {
      if (event.error) throw new Error('Upstream SSE error');
      if (event.usage) usage = { ...usage, ...event.usage };
      for (const choice of event.choices ?? []) {
        if ((choice.index ?? 0) !== 0) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string') message.content += delta.content;
        if (typeof delta.reasoning_content === 'string') message.reasoning_content = (message.reasoning_content ?? '') + delta.reasoning_content;
        for (const fragment of delta.tool_calls ?? []) {
          const tool = tools.get(fragment.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (fragment.id) tool.id += fragment.id;
          if (fragment.function?.name) tool.function.name += fragment.function.name;
          if (fragment.function?.arguments) tool.function.arguments += fragment.function.arguments;
          tools.set(fragment.index, tool);
        }
      }
    }
    message.tool_calls = [...tools.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
    return { complete: done && events.some(e => e.choices?.some((c: Obj) => c.finish_reason != null)), message, usage, events };
  }
  const blocks = new Map<number, Obj>();
  const partial = new Map<number, string>();
  for (const event of events) {
    if (event.type === 'error' || event.error) throw new Error('Upstream SSE error');
    if (event.type === 'message_start') usage = { ...usage, ...event.message?.usage };
    if (event.usage) usage = { ...usage, ...event.usage };
    if (event.type === 'message_stop') done = true;
    if (event.type === 'content_block_start') blocks.set(event.index, structuredClone(event.content_block));
    if (event.type === 'content_block_delta') {
      const block = blocks.get(event.index);
      if (!block) throw new Error('Delta without block');
      const delta = event.delta;
      if (delta.type === 'text_delta') block.text = (block.text ?? '') + delta.text;
      if (delta.type === 'thinking_delta') block.thinking = (block.thinking ?? '') + delta.thinking;
      if (delta.type === 'signature_delta') block.signature = (block.signature ?? '') + delta.signature;
      if (delta.type === 'input_json_delta') partial.set(event.index, (partial.get(event.index) ?? '') + delta.partial_json);
    }
  }
  for (const [index, text] of partial) blocks.get(index)!.input = JSON.parse(text);
  return { complete: done, message: { role: 'assistant', content: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, b]) => b) }, usage, events };
}

export function toolCalls(protocol: Protocol, message: Obj | undefined): Array<{ id: string; name: string; input: unknown }> {
  if (!message) return [];
  if (protocol === 'anthropic') return (message.content ?? []).filter((b: Obj) => b.type === 'tool_use').map((b: Obj) => ({ id: b.id, name: b.name, input: b.input }));
  return (message.tool_calls ?? []).map((b: Obj) => ({ id: b.id, name: b.function?.name, input: b.function?.arguments }));
}
