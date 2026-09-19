import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '../src/config.ts';
import { probeBun } from '../src/workflow/runtime-probe.ts';

const backend = fileURLToPath(new URL('../../CrescoAI-Backend/backend/', import.meta.url));
const bun = probeBun();
const report: any = {
  node: process.version,
  nodeSupported: Number(process.versions.node.split('.')[0]) >= 24,
  bunAvailable: bun.available,
  bunDetection: bun.method,
  backendDependenciesInstalled: existsSync(`${backend}/node_modules/@nestjs/core`),
  localTypeScriptInstalled: existsSync(fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))),
};
let config: ReturnType<typeof loadConfig> | undefined;
try { config = loadConfig(); report.configValid = true; }
catch (error) {
  report.configValid = false;
  report.configError = error instanceof ConfigError ? error.message : 'Configuration validation failed';
}
if (config) {
  report.configValid = true;
  report.harnessConfigured = Boolean(config.harnessUrl && config.harnessToken);
  report.modelProxyConfigured = Boolean(config.publicUrl && Object.keys(config.models ?? {}).length);
  report.userModelConfigured = Object.keys(config.userModels ?? {}).length > 0;
  if (config.harnessUrl && config.harnessToken) {
    try {
      const { HttpHarnessClient } = await import('../src/harness/client.ts');
      report.backend = await new HttpHarnessClient(config.harnessUrl, config.harnessToken).readiness();
    }
    catch { report.backend = { reachable: false }; }
  }
  report.readyForServiceRun = report.nodeSupported && report.harnessConfigured && report.modelProxyConfigured && report.userModelConfigured && report.backend?.databaseReachable === true && report.backend?.implementation === 'career-agent-nestjs';
} else report.readyForServiceRun = false;
report.modelApiProbed = false;
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.readyForServiceRun ? 0 : 2;
