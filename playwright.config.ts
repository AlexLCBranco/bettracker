import { defineConfig, devices } from '@playwright/test';

// Two modes:
// - local (default): builds and starts the app on a fresh SQLite file with a test password.
// - live: E2E_BASE_URL=https://<app>.vercel.app E2E_PASSWORD=<the APP_PASSWORD> — runs against the real site, every
//   test creating its own throwaway bets (tagged "e2e-…", dated 2000-01-0x so the settle queue shows them first)
//   and deleting them afterwards.
const LIVE = !!process.env.E2E_BASE_URL;
const PORT = 3100;
export const TEST_PASSWORD = 'e2e-local-password';

if (!LIVE) process.env.E2E_PASSWORD ??= TEST_PASSWORD;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: LIVE ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'app', dependencies: ['setup'], use: { storageState: 'e2e/.auth/state.json' } },
  ],
  webServer: LIVE
    ? undefined
    : {
        command: `node scripts/e2e-server.mjs ${PORT}`,
        port: PORT,
        timeout: 240_000,
        reuseExistingServer: false,
        env: { APP_PASSWORD: TEST_PASSWORD, TURSO_DATABASE_URL: 'file:data/e2e.db', E2E_INSECURE_COOKIE: '1' },
      },
});
