import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { spawnSync } from 'node:child_process';
import { probeBun } from '../src/workflow/runtime-probe.ts';
import { ConfigError, loadConfig } from '../src/config.ts';

test('Windows runtime detection falls back to a fixed CMD command for npm bun.cmd shims', () => {
  const calls: any[] = [];
  const run = ((...args: any[]) => { calls.push(args); return { status: calls.length === 1 ? null : 0 }; }) as unknown as typeof spawnSync;
  assert.deepEqual(probeBun('win32', run), { available: true, method: 'cmd_shim' });
  assert.deepEqual(calls[1].slice(0, 2), ['cmd.exe', ['/d', '/s', '/c', 'bun --version']]);
  assert.equal(calls[1][2].windowsHide, true); assert.equal(calls[1][2].timeout, 5000);
});

test('native runtime success and unavailable non-Windows runtime do not invoke CMD', () => {
  let calls = 0;
  const run = (() => { calls++; return { status: 0 }; }) as unknown as typeof spawnSync;
  assert.equal(probeBun('win32', run).method, 'direct'); assert.equal(calls, 1);
  const missing = (() => { calls++; return { status: null }; }) as unknown as typeof spawnSync;
  assert.equal(probeBun('linux', missing).available, false); assert.equal(calls, 2);
});

test('configuration diagnostics identify the field without exposing JSON fragments or model secrets', () => {
  const secret = 'DO_NOT_PRINT_THIS_SECRET';
  for (const env of [
    { GATEWAY_MODELS_JSON: '\\{' + secret },
    { GATEWAY_USER_MODELS_JSON: JSON.stringify({ [secret]: { provider: 'openai', model: 'test', apiKey: secret, baseUrl: secret } }) },
    { GATEWAY_PUBLIC_URL: 'http://127.0.0.1/' + secret },
    { GATEWAY_MODELS_JSON: JSON.stringify({ policy: { provider: 'openai', model: 1, apiKey: secret, baseUrl: 'http://localhost' } }) },
  ]) {
    assert.throws(() => loadConfig(env), error => error instanceof ConfigError && error.message.includes('GATEWAY_') && !error.message.includes(secret));
  }
});
