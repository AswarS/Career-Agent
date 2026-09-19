import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { loadConfig } from '../src/config.ts';
import { validateCreateRun } from '../src/api/validation.ts';
import { createGatewayServer } from '../src/api/server.ts';
import { runWorkflow } from '../src/workflow/run.ts';

const { values } = parseArgs({ options: {
  task: { type: 'string' }, output: { type: 'string' }, 'gateway-url': { type: 'string' },
  samples: { type: 'string', default: '2' }, cleanup: { type: 'boolean', default: false },
  'require-skill': { type: 'boolean', default: false }, 'require-training-ready': { type: 'boolean', default: false },
  'token-wait-ms': { type: 'string', default: '120000' },
} });
let server: ReturnType<typeof createGatewayServer> | undefined;
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => abort.abort());
try {
  const config = loadConfig();
  const task = validateCreateRun(JSON.parse(await readFile(values.task ?? fileURLToPath(new URL('../examples/task.json', import.meta.url)), 'utf8')));
  let gatewayUrl = values['gateway-url'];
  const samples = Number(values.samples), tokenWaitMs = Number(values['token-wait-ms']);
  if (!Number.isInteger(samples) || samples < 2 || samples > 10 || !Number.isInteger(tokenWaitMs) || tokenWaitMs < 0 || tokenWaitMs > 3_600_000) throw new Error('invalid_options');
  if (gatewayUrl) {
    const url = new URL(gatewayUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid_gateway_url');
  } else {
    if (!config.harnessUrl || !config.publicUrl || !Object.keys(config.models ?? {}).length || !Object.keys(config.userModels ?? {}).length) throw new Error('missing_training_config');
    // Preflight before starting a Gateway or allocating any task.
    const { HttpHarnessClient } = await import('../src/harness/client.ts');
    const backend = await new HttpHarnessClient(config.harnessUrl, config.harnessToken!).readiness();
    if (!backend.databaseReachable || backend.implementation !== 'career-agent-nestjs') throw new Error('backend_not_ready');
    server = createGatewayServer(config); server.listen(config.port, config.host); await once(server, 'listening');
    gatewayUrl = `http://${config.host === '::1' ? '[::1]' : config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${config.port}`;
  }
  const output = resolve(values.output ?? `Gateway/data/acceptance/${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const report = await runWorkflow({ gatewayUrl, token: config.apiToken, task, output, samples, cleanup: values.cleanup, requireSkill: values['require-skill'], requireTrainingReady: values['require-training-ready'], tokenWaitMs, signal: abort.signal });
  console.log(JSON.stringify({ passed: report.passed, report: resolve(output, 'report.json'), runIds: report.runs.map((run: any) => run.runId) }, null, 2));
  process.exitCode = report.passed ? 0 : 1;
} catch {
  console.error('Training workflow could not complete. Check configuration and readiness with scripts/doctor.ts; no credentials are printed.');
  process.exitCode = 2;
} finally {
  if (server) {
    await server.shutdownHarness();
    await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
  }
}
