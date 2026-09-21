import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { messageExport } from '../src/training/messages.ts';
import { trainingExport } from '../src/training/export.ts';
import type { JournalEvent } from '../src/training/export.ts';

const [source, destination] = process.argv.slice(2);
if (!source || !source.endsWith('.events.jsonl')) throw new Error('Usage: node Gateway/scripts/export-messages.ts <run.events.jsonl> [output.json]');
const output = destination ?? source.replace(/\.events\.jsonl$/, '.messages.json');
if (resolve(source) === resolve(output)) throw new Error('Cannot overwrite source journal');
const raw = await readFile(source, 'utf8');
if (!raw.endsWith('\n')) throw new Error('Journal has an incomplete trailing record; retry after capture finishes');
const events: JournalEvent[] = raw.trimEnd().split('\n').map(line => JSON.parse(line));
const ids = new Set<string>();
for (const [i, event] of events.entries()) {
  if (event.schemaVersion !== '1.0' || event.sequence !== i + 1 || event.runId !== events[0]?.runId || ids.has(event.eventId) || !event.payload) throw new Error('Invalid journal');
  ids.add(event.eventId);
}
// Offline snapshot does not seal the journal or claim a verified manifest.
const result = { runId: events[0]?.runId, sourceJournal: resolve(source), snapshot: true,
  ...messageExport(events), ...trainingExport(events, events.find(e => e.payload.type === 'run.finished')?.payload.status ?? 'unknown', false) };
await writeFile(output, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({ output: resolve(output), calls: result.callCount, issues: result.issues, trainingReady: result.trainingReady, reasons: result.reasons }, null, 2));
