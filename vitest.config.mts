import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Date tests (*.tz.test.ts) run once per time zone, set here (not by a shell prefix) so `npm test` behaves the same
// on Windows, Linux and CI. São Paulo is the owner's; New York and Tokyo catch UTC shifts in both directions.
const TIME_ZONES = ['America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo'];
const TZ_TESTS = ['tests/**/*.tz.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: TZ_TESTS, env: { TZ: 'UTC' } } },
      ...TIME_ZONES.map((tz) => ({ extends: true, test: { name: `tz:${tz}`, include: TZ_TESTS, env: { TZ: tz } } })),
    ],
  },
});
