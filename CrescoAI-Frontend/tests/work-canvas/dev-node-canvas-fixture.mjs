import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const child = spawn(
  npmCommand,
  ['run', 'dev', '--', ...args],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS: 'http://127.0.0.1:4318',
      VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL: 'http://127.0.0.1:4318',
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
