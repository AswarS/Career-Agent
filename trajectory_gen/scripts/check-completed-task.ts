import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (!values.output) throw new Error('--output is required');
const output = resolve(values.output);

try {
  const summary = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
  if (summary.status !== 'completed' || summary.sftReady !== true || summary.semanticAudit?.accepted === false || typeof summary.runId !== 'string') process.exit(1);
  await stat(resolve(output, `${summary.runId}.qwen3_5_sft.jsonl`));
  console.log(`[skip] completed run ${summary.runId}`);
  process.exit(0);
} catch {
  process.exit(1);
}
