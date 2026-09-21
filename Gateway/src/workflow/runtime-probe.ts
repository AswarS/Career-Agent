import { spawnSync } from 'node:child_process';

export function probeBun(platform: NodeJS.Platform = process.platform, run: typeof spawnSync = spawnSync) {
  const direct = run('bun', ['--version'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
  if (direct.status === 0) return { available: true, method: 'direct' };
  if (platform === 'win32') {
    // npm's Windows shim is bun.cmd; execFile/spawn without a shell cannot run it.
    // This is a fixed command, with no configuration or user input interpolated.
    const shim = run('cmd.exe', ['/d', '/s', '/c', 'bun --version'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    if (shim.status === 0) return { available: true, method: 'cmd_shim' };
  }
  return { available: false, method: 'not_found_or_not_runnable' };
}
