import { loadConfig } from './config.ts';
import { createGatewayServer } from './api/server.ts';

const config = loadConfig();
const server = createGatewayServer(config);
server.on('error', (error) => {
  console.error(`[Gateway] ${error.message}`);
  process.exitCode = 1;
});
server.listen(config.port, config.host, () => {
  console.log(`[Gateway] listening on ${config.host}:${config.port}; phase=6; harnessExecution=${Boolean(config.harnessUrl)}; modelProxy=${Boolean(config.publicUrl && Object.keys(config.models ?? {}).length)}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    server.close(() => { process.exitCode = 0; });
    server.closeAllConnections();
    await server.shutdownHarness();
  });
}

