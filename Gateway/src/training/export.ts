export interface JournalEvent {
  schemaVersion: '1.0'; eventId: string; runId: string; occurredAt: string;
  sequence: number; receivedAt: string; payload: Record<string, any>;
}

/** Accept engine arrays only; never synthesize token IDs or log probabilities. */
export function validateTokens(p: Record<string, any>) {
  const t = p.tokens;
  if (typeof p.requestId !== 'string' || !t || t.source !== 'inference_engine'
    || Object.keys(t).some(key => !['source', 'modelVersion', 'tokenizerVersion', 'tokenIds', 'promptTokenCount', 'lossMask', 'logprobs'].includes(key))
    || typeof t.modelVersion !== 'string' || !t.modelVersion.trim() || typeof t.tokenizerVersion !== 'string' || !t.tokenizerVersion.trim()
    || !Array.isArray(t.tokenIds) || !t.tokenIds.length || t.tokenIds.length > 1_000_000
    || !Number.isInteger(t.promptTokenCount) || t.promptTokenCount < 0 || t.promptTokenCount >= t.tokenIds.length
    || t.tokenIds.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) < 0)
    || !Array.isArray(t.lossMask) || t.lossMask.length !== t.tokenIds.length
    || t.lossMask.some((n: unknown, i: number) => n !== (i < t.promptTokenCount ? 0 : 1))
    || !Array.isArray(t.logprobs) || t.logprobs.length !== t.tokenIds.length
    || t.logprobs.some((n: unknown, i: number) => i < t.promptTokenCount ? n !== null : typeof n !== 'number' || !Number.isFinite(n) || n > 0)) throw new Error('invalid_training_tokens');
}

export function trainingExport(events: JournalEvent[], status: string, sealed: boolean) {
  const reasons = new Set<string>();
  const requests = new Map<string, JournalEvent[]>(), responses = new Map<string, JournalEvent[]>(), tokens = new Map<string, JournalEvent[]>();
  const tools = new Set<string>(), results = new Set<string>();
  const add = (map: Map<string, JournalEvent[]>, id: string, event: JournalEvent) => map.set(id, [...(map.get(id) ?? []), event]);
  for (const event of events) {
    const p = event.payload;
    if (p.type === 'model.request') add(requests, p.identity.requestId, event);
    if (p.type === 'model.response') add(responses, p.identity.requestId, event);
    if (p.type === 'training.tokens') add(tokens, p.requestId, event);
    if (p.type === 'tool.call') { if (tools.has(p.toolUseId)) reasons.add('duplicate_tool_call'); tools.add(p.toolUseId); }
    if (p.type === 'tool.result') { if (results.has(p.toolUseId)) reasons.add('duplicate_tool_result'); if (!tools.has(p.toolUseId)) reasons.add('tool_result_before_call'); results.add(p.toolUseId); }
    if (p.type === 'capture.rejected' || p.type === 'limit.exceeded') reasons.add(p.type);
  }
  if (!sealed) reasons.add('not_finalized');
  if (status !== 'completed') reasons.add('run_not_completed');
  if (!requests.size) reasons.add('no_policy_requests');
  const samples: Record<string, unknown>[] = []; const versions = new Set<string>();
  for (const [id, req] of requests) {
    const reply = responses.get(id) ?? [], token = tokens.get(id) ?? [];
    if (req.length !== 1 || reply.length !== 1 || reply[0]?.payload.complete !== true || !(reply[0]?.payload.status >= 200 && reply[0]?.payload.status < 300)) reasons.add('incomplete_policy_call');
    if (reply[0] && (reply[0].sequence <= req[0]!.sequence || reply[0].payload.protocol !== req[0]!.payload.protocol)) reasons.add('invalid_policy_response_order_or_protocol');
    if (token.length !== 1) { reasons.add('missing_or_duplicate_tokens'); continue; }
    const t = token[0]!.payload.tokens;
    versions.add(JSON.stringify([t.modelVersion, t.tokenizerVersion]));
    samples.push({ requestId: id, requestSequence: req[0]!.sequence, responseSequence: reply[0]?.sequence ?? null, ...t });
  }
  if ([...responses.keys(), ...tokens.keys()].some(id => !requests.has(id))) reasons.add('orphan_policy_data');
  if ([...tools].some(id => !results.has(id))) reasons.add('missing_tool_result');
  if ([...results].some(id => !tools.has(id))) reasons.add('orphan_tool_result');
  if (versions.size > 1) reasons.add('mixed_model_or_tokenizer_versions');
  return { trainingReady: reasons.size === 0, reasons: [...reasons], tokenSource: 'authenticated_inference_producer', samples };
}
