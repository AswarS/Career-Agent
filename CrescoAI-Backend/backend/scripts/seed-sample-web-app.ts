/**
 * Seed a sample interactive Web App into a user's app_generated workspace
 * without running the agent/skill flow, for quick verification of the app
 * hosting, event upload, and progress-retention pipeline.
 *
 * Usage:
 *   bun run ./scripts/seed-sample-web-app.ts [userId] [appId]
 *
 * Defaults: userId=3, appId=web-app-sample.
 */
import { copyFile, mkdir, rm, utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(backendDir));

const exampleDir = join(
  repoRoot,
  'skills',
  'develop-web-game',
  'examples',
  'fraction-practice',
);
const telemetryAsset = join(
  repoRoot,
  'skills',
  'develop-web-game',
  'assets',
  'agent-telemetry.js',
);

const userId = process.argv[2] ?? '3';
const appId = process.argv[3] ?? 'web-app-sample';

const targetDir = join(
  backendDir,
  'src',
  'Network',
  'user',
  userId,
  'workspace',
  'app_generated',
  appId,
);

const now = new Date();

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await copyFile(join(exampleDir, 'index.html'), join(targetDir, 'index.html'));
await copyFile(join(exampleDir, 'output.json'), join(targetDir, 'output.json'));
await copyFile(telemetryAsset, join(targetDir, 'agent-telemetry.js'));

// Fresh mtime so the post-turn generated-file scan picks the app up.
const stamp = now.toISOString();
for (const file of ['index.html', 'output.json', 'agent-telemetry.js']) {
  await utimes(join(targetDir, file), now, now);
}

console.log(`Seeded sample app for user ${userId}:`);
console.log(`  dir:  ${targetDir}`);
console.log(`  app:  http://localhost:4000/api/career-agent/generated/${userId}/app/${appId}/`);
console.log(`  events endpoint: POST http://localhost:4000/api/career-agent/generated/${userId}/app/${appId}/events`);
console.log(`\nVerify (once the backend on :4000 is running):`);
console.log(`  curl "http://localhost:4000/api/career-agent/generated/${userId}/app/${appId}/" -s | head -5`);
console.log(`  curl -X POST "http://localhost:4000/api/career-agent/generated/${userId}/app/${appId}/events" \\`);
console.log(`    -H 'Content-Type: application/json' \\`);
console.log(`    -d '{"schema":"app-event-batch/1.0","session_id":"seed-check","sequence_start":1,"events":[{"seq":1,"type":"attempt_submitted","at":"${stamp}","data":{"correct":false,"errorCategory":"addition-error","attempt":1}}]}'`);
console.log(`\nTimestamp used: ${stamp}`);
