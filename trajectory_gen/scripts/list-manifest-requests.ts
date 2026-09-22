// Prints the absolute path of every materialized request in the manifest, one
// per line, in ascending task ordinal. Batch runners consume this instead of a
// hardcoded scenario list, so `prepare-syn-task-runs.ts --range` decides scope.
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = resolve(repoRoot, 'trajectory_gen/trajectories/syn-tasks/manifest.json');
const requestsRoot = resolve(dirname(manifestPath), 'requests');

let manifest: Record<string, any>;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Generate it first with: bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range <spec>');
  process.exit(2);
}

const cases = Array.isArray(manifest.cases) ? [...manifest.cases] : [];
if (!cases.length) {
  console.error(`Manifest ${manifestPath} lists no cases.`);
  process.exit(2);
}
cases.sort((left, right) => (left.ordinal ?? 0) - (right.ordinal ?? 0));

for (const item of cases) {
  if (typeof item.request !== 'string' || !item.request || isAbsolute(item.request)) {
    console.error(`Manifest case for ${item.scenarioId ?? 'unknown'} has an unsafe request path.`);
    process.exit(2);
  }
  process.stdout.write(`${resolve(requestsRoot, item.request)}\n`);
}
