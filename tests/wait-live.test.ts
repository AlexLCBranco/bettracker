import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';

// Runs scripts/wait-live.ts exactly as CI does (`tsx scripts/wait-live.ts <sha>`) against a fake /version.json.
// Regression: the script once used top-level await, which tsx can't compile in this CommonJS package.
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version: '9.9.9', commit: 'abc1234', builtAt: '2000-01-01T00:00:00Z' }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Async spawn: a sync one would block this process, and with it the fake server the script is polling.
function run(sha: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/wait-live.ts', sha], {
      env: { ...process.env, E2E_BASE_URL: base },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('wait-live script', () => {
  it('exits 0 once the live site serves the commit', async () => {
    const r = await run('abc1234deadbeef');
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('live: v9.9.9 at abc1234');
  }, 40_000);

  it('exits 2 with usage when the sha is missing', async () => {
    const r = await run('');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage');
  }, 40_000);
});
