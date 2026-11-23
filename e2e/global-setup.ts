// Notes when this e2e run started, so the final sweep can tell this run's leftovers (a leak: fail) from older ones.
import { mkdirSync, writeFileSync } from 'node:fs';
import { RUN_START_FILE } from './global-teardown';

export default async function globalSetup() {
  mkdirSync('e2e/.auth', { recursive: true });
  // 30 s margin: bets get their createdAt from the server's clock
  writeFileSync(RUN_START_FILE, new Date(Date.now() - 30_000).toISOString());
}
