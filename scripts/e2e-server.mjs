// Starts the production build for the local e2e run on a fresh database file (data/e2e.db).
// Builds first unless E2E_SKIP_BUILD=1 (CI builds in an earlier step).
import { execSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const port = process.argv[2] ?? '3100';
for (const f of ['data/e2e.db', 'data/e2e.db-wal', 'data/e2e.db-shm', 'data/e2e.db-journal']) rmSync(f, { force: true });
if (!process.env.E2E_SKIP_BUILD) execSync('npx next build', { stdio: 'inherit' });
const child = spawn('npx', ['next', 'start', '-p', port], { stdio: 'inherit', shell: true, env: { ...process.env, NODE_ENV: 'production' } });
const stop = () => child.kill();
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => process.exit(code ?? 0));
