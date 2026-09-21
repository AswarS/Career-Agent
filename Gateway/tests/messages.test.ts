import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageExport, messagesListExport } from '../src/training/messages.ts';
import type { JournalEvent } from '../src/training/export.ts';

const identity = { requestId: 'r1', agentRole: 'main', purpose: 'policy' };
const event = (sequence: number, payload: Record<string, any>) => ({ sequence, payload } as JournalEvent);
const request = event(1, { type: 'model.request', identity, protocol: 'openai', body: { messages: [{ role: 'user', content: '原始输入' }], tools: [{ type: 'function' }], stream: true } });
test('messages_list removes repeated input history and preserves captured reasoning', () => {
  const assistant = { role: 'assistant', content: 'read', reasoning_content: 'private reasoning', tool_calls: [{ id: 't', type: 'function', function: { name: 'Read', arguments: '{}' } }] };
  const observed = { role: 'tool', tool_call_id: 't', content: 'file content' };
  const result = messagesListExport([request,
    event(2, { type: 'model.response', identity, protocol: 'openai', status: 200, complete: true, response: { message: assistant } }),
    event(3, { ...request.payload, identity: { ...identity, requestId: 'r2' }, body: { messages: [...request.payload.body.messages, { ...assistant, reasoning_content: undefined }, observed] } }),
    event(4, { type: 'model.response', identity: { ...identity, requestId: 'r2' }, protocol: 'openai', status: 200, complete: true, response: { message: { role: 'assistant', content: 'done' } } }),
  ]);
  assert.deepEqual(result.messages_list?.map(m => m.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.equal(result.messages_list?.[1].reasoning_content, 'private reasoning');
  assert.deepEqual(result.issues, []);
});
test('rewritten input contexts are reported rather than silently merged', () => {
  const result = messagesListExport([request, event(2, { ...request.payload, identity: { ...identity, requestId: 'r2' }, body: { messages: [{ role: 'user', content: 'rewritten' }] } })]);
  assert.equal(result.messages_list, null);
  assert.ok(result.issues.includes('context_rewritten_use_per_call_messages'));
});
test('message export assembles legacy SSE, retaining reasoning and fragmented tool arguments', () => {
  const chunks = [
    { choices: [{ delta: { reasoning_content: '思考', tool_calls: [{ index: 0, id: 't1', function: { name: 'Read', arguments: '{"pa' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a"}' } }] }, finish_reason: 'tool_calls' }] },
  ];
  const rawBody = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  const response = event(2, { type: 'model.response', identity, protocol: 'openai', status: 200, complete: true, rawBody });
  const result = messageExport([request, response]);
  assert.equal(result.calls[0]!.assistant.tool_calls[0].function.arguments, '{"path":"a"}');
  assert.equal(result.calls[0]!.assistant.reasoning_content, '思考');
  assert.deepEqual(result.calls[0]!.request, request.payload.body);
  assert.equal(JSON.stringify(result).includes('data: [DONE]'), false);
  assert.deepEqual(result.issues, []);
});
test('missing responses remain incomplete and non-main requests are excluded', () => {
  const result = messageExport([request, event(2, { ...request.payload, identity: { ...identity, agentRole: 'subagent' } })]);
  assert.equal(result.callCount, 1);
  assert.equal(result.calls[0]!.complete, false);
  assert.equal(result.calls[0]!.assistant, null);
  assert.deepEqual(result.issues, ['r1:incomplete_response']);
});
test('anthropic blocks and failed tool results survive projection', () => {
  const req = event(1, { ...request.payload, protocol: 'anthropic' });
  const message = { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } }] };
  const result = messageExport([req,
    event(2, { type: 'model.response', identity, protocol: 'anthropic', status: 200, complete: true, response: { message } }),
    event(3, { type: 'tool.call', requestId: 'r1', toolUseId: 't1', agentId: 'main', name: 'Read' }),
    event(4, { type: 'tool.result', toolUseId: 't1', agentId: 'main', content: 'missing file', isError: true }),
  ]);
  assert.deepEqual(result.calls[0]!.assistant, message);
  assert.equal(result.calls[0]!.tools[0]!.results[0]!.isError, true);
});
