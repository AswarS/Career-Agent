import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const htmlAppExampleUrl = process.env.VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL || 'http://127.0.0.1:4320';
const nodeAppExampleUrl = process.env.VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL || 'http://127.0.0.1:3000';
const trustedCanvasOrigins = [
  process.env.VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS,
  htmlAppExampleUrl,
  nodeAppExampleUrl,
]
  .filter(Boolean)
  .join(',');

const child = spawn(
  npmCommand,
  ['run', 'dev', '--', ...args],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL: htmlAppExampleUrl,
      VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL: nodeAppExampleUrl,
      VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS: trustedCanvasOrigins,
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
