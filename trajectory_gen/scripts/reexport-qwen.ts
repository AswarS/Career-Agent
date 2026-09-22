import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { TraceStore } from '../../Gateway/src/trajectories/trace-store.ts';

const { values } = parseArgs({ options: {
  'run-id': { type: 'string' },
  'trace-dir': { type: 'string' },
  output: { type: 'string' },
} });

if (!values['run-id'] || !values['trace-dir'] || !values.output) {
  throw new Error('Usage: bun reexport-qwen.ts --run-id <uuid> --trace-dir <gateway-trace-dir> --output <task-run-dir>');
}

const runId = values['run-id'];
const output = resolve(values.output);
const summary = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
if (summary.runId !== runId || summary.semanticAudit?.accepted !== true) {
  throw new Error('Output summary does not identify a semantically accepted run');
}

const qwen = await new TraceStore(resolve(values['trace-dir'])).export(runId, 'qwen3_5_sft') as any;
if (!qwen.sftReady || !Array.isArray(qwen.messages) || typeof qwen.tools !== 'string') {
  throw new Error(`Qwen export is not SFT-ready: ${(qwen.issues ?? []).join(', ')}`);
}
const serialized = JSON.stringify(qwen);
const trainingPayload = JSON.stringify({ messages: qwen.messages, tools: qwen.tools });
if (/private-teacher-guidance|teacher-only policy|invocation_bindings|validation_witness_arguments/i.test(serialized)
  || /Tool loaded\./i.test(trainingPayload)) throw new Error('Private or control-plane metadata remains in the Qwen export');

await Promise.all([
  writeFile(resolve(output, `${runId}.qwen3_5_sft.json`), JSON.stringify(qwen, null, 2) + '\n'),
  writeFile(resolve(output, `${runId}.qwen3_5_sft.jsonl`), JSON.stringify({ messages: qwen.messages, tools: qwen.tools }) + '\n'),
]);

console.log(JSON.stringify({ runId, messages: qwen.messages.length, output, sftReady: qwen.sftReady }, null, 2));
